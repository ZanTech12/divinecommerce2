
import mongoose from "mongoose";
import crypto from "crypto";

import Product from "../models/Product.js";
import Order from "../models/Order.js";

// ==========================================
// HELPERS
// ==========================================

const normalizePhone = (phone = "") =>
  String(phone).replace(/\D/g, "");

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Create a regex that supports common singular/plural forms.
// Solar Panel -> Solar Panels
// Solar Panels -> Solar Panel
const createFlexibleWordRegex = (word = "") => {
  const escaped = escapeRegex(
    String(word).trim()
  );

  if (!escaped) return null;

  let pattern = escaped;

  if (
    escaped.toLowerCase().endsWith("ies") &&
    escaped.length > 3
  ) {
    pattern = `${escaped.slice(0, -3)}(?:y|ies)`;
  } else if (
    escaped.toLowerCase().endsWith("s") &&
    !escaped.toLowerCase().endsWith("ss") &&
    escaped.length > 3
  ) {
    pattern = `${escaped.slice(0, -1)}s?`;
  } else if (escaped.length > 2) {
    pattern = `${escaped}s?`;
  }

  return new RegExp(pattern, "i");
};

const getProductPrice = (product) => {
  const price = Number(product.price);
  const discountPrice = Number(product.discountPrice);

  if (
    Number.isFinite(discountPrice) &&
    discountPrice > 0 &&
    discountPrice < price
  ) {
    return discountPrice;
  }

  return price;
};

// Only expose approved public product fields.
// engineeringPrice and assignedSalesRep are never exposed.

const publicProduct = (product) => ({
  _id: product._id,
  name: product.name,
  description: product.description,
  price: getProductPrice(product),
  originalPrice: product.price,
  image: product.image || "",
  images: product.images || [],
  category: product.category,
  brand: product.brand || "",
  sku: product.sku || "",
  tags: product.tags || [],
  countInStock: product.countInStock,
  rating: product.rating || 0,
  numReviews: product.numReviews || 0,
  isFeatured: product.isFeatured || false,
  isNewArrival: product.isNewArrival || false,
  isFlashSale: product.isFlashSale || false
});

const productPublicFields =
  "name description price discountPrice image images category brand sku tags countInStock rating numReviews isFeatured isNewArrival isFlashSale";

// ==========================================
// 1. SEARCH PRODUCTS
//
// GET /api/whatsapp/products
//
// Examples:
// ?search=solar
// ?search=inverter
// ?search=5000VA
// ?search=Solar Panels
// ?category=Solar Panels
// ?page=1&limit=10
// ?search=battery&category=Solar Batteries
// ==========================================

export const searchProducts = async (req, res) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();

    const category = String(
      req.query.category || ""
    ).trim();

    const requestedPage = Number(req.query.page);
    const requestedLimit = Number(req.query.limit);

    const page = Number.isFinite(requestedPage)
      ? Math.max(1, Math.floor(requestedPage))
      : 1;

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, Math.floor(requestedLimit)))
      : 10;

    // Only active products are available to customers.
    const filter = {
      isActive: true
    };

    // ======================================
    // FLEXIBLE PRODUCT SEARCH
    // ======================================

    if (search) {
      const words = search
        .split(/\s+/)
        .filter(Boolean);

      const searchFields = [
        "name",
        "description",
        "brand",
        "category",
        "sku",
        "tags"
      ];

      // Every search word must match at least
      // one searchable product field.
      filter.$and = words.map((word) => {
        const regex = createFlexibleWordRegex(word);

        return {
          $or: searchFields.map((field) => ({
            [field]: regex
          }))
        };
      });
    }

    // ======================================
    // FLEXIBLE CATEGORY FILTER
    // ======================================

    if (category) {
      const words = category
        .split(/\s+/)
        .filter(Boolean);

      const categoryConditions = words.map(
        (word) => ({
          category: createFlexibleWordRegex(word)
        })
      );

      if (categoryConditions.length === 1) {
        filter.category = categoryConditions[0].category;
      } else if (categoryConditions.length > 1) {
        // If search conditions already exist,
        // preserve them while adding category matching.
        filter.$and = [
          ...(filter.$and || []),
          {
            $and: categoryConditions
          }
        ];
      }
    }

    // ======================================
    // DATABASE QUERY
    // ======================================

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select(productPublicFields)
        .sort({
          isFeatured: -1,
          createdAt: -1
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Product.countDocuments(filter)
    ]);

    console.log("WhatsApp product search:", {
      search,
      category,
      page,
      limit,
      total,
      returned: products.length
    });

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      products: products.map(publicProduct)
    });

  } catch (error) {
    console.error(
      "WhatsApp product search:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to search products"
    });
  }
};

// ==========================================
// 2. GET PRODUCT DETAILS
//
// GET /api/whatsapp/products/:id
// ==========================================

export const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const product = await Product.findOne({
      _id: id,
      isActive: true
    })
      .select(productPublicFields)
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      product: publicProduct(product)
    });

  } catch (error) {
    console.error(
      "WhatsApp product details:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve product"
    });
  }
};

// ==========================================
// 3. GET PRODUCT CATEGORIES
//
// GET /api/whatsapp/categories
//
// Categories come directly from MongoDB.
// No hardcoded category names.
// ==========================================

export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct(
      "category",
      {
        isActive: true
      }
    );

    const cleanCategories = categories
      .filter(
        category =>
          typeof category === "string" &&
          category.trim() !== ""
      )
      .map(category => category.trim());

    // Remove duplicate names ignoring letter case.
    const uniqueCategories = [
      ...new Map(
        cleanCategories.map(category => [
          category.toLowerCase(),
          category
        ])
      ).values()
    ].sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      success: true,
      total: uniqueCategories.length,
      categories: uniqueCategories
    });

  } catch (error) {
    console.error(
      "WhatsApp categories:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve categories"
    });
  }
};

// ==========================================
// 4. CREATE WHATSAPP GUEST ORDER
//
// POST /api/whatsapp/orders
// ==========================================

export const createWhatsAppOrder = async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      whatsappPhone,
      notes
    } = req.body;

    // Validate order items.
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 30
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid order items"
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "Delivery information is required"
      });
    }

    // Validate required delivery information.
    const requiredFields = [
      "fullName",
      "street",
      "city",
      "state",
      "zipCode",
      "country",
      "phone"
    ];

    for (const field of requiredFields) {
      if (
        !String(shippingAddress[field] || "").trim()
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} is required`
        });
      }
    }

    // Verify customer phone against WhatsApp sender.
    const customerPhone = normalizePhone(
      shippingAddress.phone
    );

    const senderPhone = normalizePhone(
      whatsappPhone
    );

    if (
      !customerPhone ||
      !senderPhone ||
      customerPhone !== senderPhone
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The delivery phone number must match the WhatsApp number placing the order."
      });
    }

    if (
      customerPhone.length < 10 ||
      customerPhone.length > 15
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid WhatsApp phone number"
      });
    }

    // Combine duplicate product IDs.
    const quantities = new Map();

    for (const item of items) {
      const productId = String(
        item.productId || ""
      );

      const quantity = Number(item.quantity);

      if (
        !mongoose.Types.ObjectId.isValid(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product or quantity"
        });
      }

      const newQuantity =
        (quantities.get(productId) || 0) + quantity;

      if (newQuantity > 100) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum quantity per product is 100"
        });
      }

      quantities.set(productId, newQuantity);
    }

    const productIds = [...quantities.keys()];

    // Retrieve real products from MongoDB.
    // Never trust prices or names sent by WhatsApp.
    const products = await Product.find({
      _id: {
        $in: productIds
      },
      isActive: true
    }).select(
      "name price discountPrice image sku countInStock"
    );

    if (products.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "One or more products are unavailable"
      });
    }

    const orderItems = [];
    let subtotal = 0;

    for (const product of products) {
      const quantity = quantities.get(
        product._id.toString()
      );

      // Validate available stock.
      if (product.countInStock < quantity) {
        return res.status(400).json({
          success: false,
          message:
            `${product.name} does not have enough stock. Available: ${product.countInStock}`
        });
      }

      // Always calculate price from the database.
      const price = getProductPrice(product);

      subtotal += price * quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        quantity,
        price,
        discountPrice:
          price < product.price
            ? price
            : undefined,
        sku: product.sku
      });
    }

    // Existing shipping and tax placeholders.
    const shippingCost = 0;
    const tax = 0;
    const discount = 0;

    const totalAmount =
      subtotal + shippingCost + tax - discount;

    if (
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount"
      });
    }

    const orderNumber = (
      `DSH-${Date.now()}-${crypto
        .randomBytes(3)
        .toString("hex")}`
    ).toUpperCase();

    // Create guest order.
    const order = await Order.create({
      orderNumber,

      user: null,

      guestEmail:
        shippingAddress.email || undefined,

      whatsappPhone: customerPhone,

      items: orderItems,

      shippingAddress: {
        fullName: String(
          shippingAddress.fullName
        ).trim(),

        street: String(
          shippingAddress.street
        ).trim(),

        apartment: String(
          shippingAddress.apartment || ""
        ).trim(),

        city: String(
          shippingAddress.city
        ).trim(),

        state: String(
          shippingAddress.state
        ).trim(),

        zipCode: String(
          shippingAddress.zipCode
        ).trim(),

        country: String(
          shippingAddress.country
        ).trim(),

        phone: String(
          shippingAddress.phone
        ).trim(),

        email:
          shippingAddress.email || undefined
      },

      subtotal,
      shippingCost,
      tax,
      discount,
      totalAmount,

      paymentMethod: "monnify",
      paymentGateway: "monnify",
      paymentStatus: "pending",

      status: "pending",

      amountPaid: 0,

      notes: [
        "Order created through Divine Solar Hub WhatsApp.",
        notes
          ? String(notes).slice(0, 500)
          : ""
      ]
        .filter(Boolean)
        .join(" ")
    });

    return res.status(201).json({
      success: true,
      message:
        "WhatsApp order created successfully",

      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        whatsappPhone: order.whatsappPhone,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        tax: order.tax,
        discount: order.discount,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        status: order.status
      }
    });

  } catch (error) {
    console.error(
      "WhatsApp order creation:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create order"
    });
  }
};

// ==========================================
// 5. TRACK WHATSAPP ORDER
//
// GET /api/whatsapp/orders/:orderNumber
// ==========================================

export const trackWhatsAppOrder = async (req, res) => {
  try {
    const orderNumber = String(
      req.params.orderNumber || ""
    )
      .trim()
      .toUpperCase();

    const whatsappPhone = normalizePhone(
      req.query.whatsappPhone
    );

    if (!orderNumber || !whatsappPhone) {
      return res.status(400).json({
        success: false,
        message:
          "Order number and WhatsApp phone are required"
      });
    }

    const order = await Order.findOne({
      orderNumber
    }).select(
      "orderNumber whatsappPhone shippingAddress items subtotal shippingCost totalAmount paymentStatus status trackingNumber estimatedDelivery createdAt"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Support older orders without whatsappPhone.
    const savedPhone = normalizePhone(
      order.whatsappPhone ||
      order.shippingAddress?.phone
    );

    if (savedPhone !== whatsappPhone) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to view this order."
      });
    }

    return res.status(200).json({
      success: true,

      order: {
        orderNumber: order.orderNumber,

        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity
        })),

        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        status: order.status,
        trackingNumber: order.trackingNumber,
        estimatedDelivery: order.estimatedDelivery,
        createdAt: order.createdAt
      }
    });

  } catch (error) {
    console.error(
      "WhatsApp order tracking:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to track order"
    });
  }
};
