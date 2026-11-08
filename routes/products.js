import express from 'express';
import Product from '../models/Product.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// ==========================================
// CONFIGURATION
// ==========================================

const PUBLIC_PAGE_SIZE = 24;
const PUBLIC_MAX_PAGE_SIZE = 100;

const ADMIN_PAGE_SIZE = 50;
const ADMIN_MAX_PAGE_SIZE = 100;

const CATEGORY_PAGE_SIZE = 24;
const CATEGORY_MAX_PAGE_SIZE = 100;

const SEARCH_MAX_LENGTH = 80;

// ==========================================
// OPTIONAL AUTH
// ==========================================

const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id)
        .select('-password')
        .lean();
    }
  } catch {
    // Invalid/expired token: continue as public visitor.
  }

  next();
};

// ==========================================
// PERMISSIONS AND RESPONSE HELPERS
// ==========================================

const canAlwaysSeeEngPrice = (user) =>
  Boolean(
    user &&
    ['admin', 'engineer', 'sales_rep'].includes(user.role)
  );

const canSeeEngPriceForProduct = (user) =>
  canAlwaysSeeEngPrice(user);

const canEditPrices = (user) =>
  Boolean(user && ['admin', 'sales_rep'].includes(user.role));

// Remove internal fields from public product responses.
const stripInternalFields = (product) => {
  if (!product) return product;

  const obj = typeof product.toObject === 'function'
    ? product.toObject()
    : { ...product };

  const {
    engineeringPrice,
    assignedSalesRep,
    ...publicData
  } = obj;

  return publicData;
};

const processProductsForUser = (products, user) => {
  if (canAlwaysSeeEngPrice(user)) {
    return products;
  }

  return products.map(stripInternalFields);
};

// ==========================================
// PAGINATION HELPER
// ==========================================

const parsePositiveInt = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};

// ==========================================
// SORT HELPER
// ==========================================

const getSortOption = (sort) => {
  switch (sort) {
    case 'price-asc':
      return {
        price: 1,
        _id: 1
      };

    case 'price-desc':
      return {
        price: -1,
        _id: 1
      };

    case 'name':
      return {
        name: 1,
        _id: 1
      };

    case 'rating':
      return {
        rating: -1,
        _id: 1
      };

    case 'newest':
    default:
      return {
        createdAt: -1,
        _id: -1
      };
  }
};

// ==========================================
// SEARCH HELPER
// ==========================================

// Escape user input so it cannot become
// an arbitrary regular expression.

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addSearchFilter = (filter, search) => {
  if (typeof search !== 'string') return;

  const cleaned = search.trim().slice(0, SEARCH_MAX_LENGTH);

  if (!cleaned) return;

  const expression = new RegExp(
    escapeRegex(cleaned),
    'i'
  );

  filter.$or = [
    { name: expression },
    { description: expression },
    { category: expression },
    { brand: expression },
    { sku: expression }
  ];
};

// ==========================================
// COMMON FILTER HELPER
// ==========================================

const addCommonFilters = (
  filter,
  query,
  includeActive = true
) => {
  if (includeActive) {
    filter.isActive = true;
  }

  if (query.category) {
    const category = String(query.category)
      .trim()
      .slice(0, 100);

    if (category) {
      filter.category = {
        $regex: `^${escapeRegex(category)}$`,
        $options: 'i'
      };
    }
  }

  if (query.subcategory) {
    const subcategory = String(query.subcategory)
      .trim()
      .slice(0, 100);

    if (subcategory) {
      filter.subcategory = {
        $regex: `^${escapeRegex(subcategory)}$`,
        $options: 'i'
      };
    }
  }

  if (query.featured === 'true') {
    filter.isFeatured = true;
  }

  if (query.newArrival === 'true') {
    filter.isNewArrival = true;
  }

  if (query.flashSale === 'true') {
    filter.isFlashSale = true;
  }

  if (query.onSale === 'true') {
    filter.discountPrice = {
      $gt: 0,
      $ne: null
    };
  }

  addSearchFilter(filter, query.search);
};

// ==========================================
// GET PRODUCTS
// GET /api/products
// ==========================================

router.get('/', optionalAuth, async (req, res) => {
  try {
    const filter = {};

    addCommonFilters(filter, req.query, true);

    const page = parsePositiveInt(
      req.query.page,
      1,
      1000000
    );

    const limit = parsePositiveInt(
      req.query.limit,
      PUBLIC_PAGE_SIZE,
      PUBLIC_MAX_PAGE_SIZE
    );

    const skip = (page - 1) * limit;

    const sortOption = getSortOption(req.query.sort);

    // Preserve existing response formats:
    //
    // Without page/limit:
    // Returns an array, limited to 24 products.
    //
    // With page/limit:
    // Returns products, total, page and totalPages.

    const wantsPagination =
      req.query.page !== undefined ||
      req.query.limit !== undefined;

    const productsQuery = Product.find(filter)
      .select(
        '+discountPrice +engineeringPrice +assignedSalesRep'
      )
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean()
      .maxTimeMS(10000);

    // Simple product listing.
    // No unnecessary countDocuments query.

    if (!wantsPagination) {
      const products = await productsQuery;

      return res.json(
        processProductsForUser(products, req.user)
      );
    }

    // Run product retrieval and counting concurrently.

    const [products, total] = await Promise.all([
      productsQuery,

      Product.countDocuments(filter)
        .maxTimeMS(10000)
    ]);

    return res.json({
      products: processProductsForUser(
        products,
        req.user
      ),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('GET /products failed:', error);

    return res.status(500).json({
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// ==========================================
// GET ALL PRODUCTS FOR ADMIN
// GET /api/products/admin/all
// ==========================================

router.get(
  '/admin/all',
  protect,
  requirePermission('manage_products'),
  async (req, res) => {
    try {
      const filter = {};

      addCommonFilters(
        filter,
        req.query,
        false
      );

      const page = parsePositiveInt(
        req.query.page,
        1,
        1000000
      );

      const limit = parsePositiveInt(
        req.query.limit,
        ADMIN_PAGE_SIZE,
        ADMIN_MAX_PAGE_SIZE
      );

      const products = await Product.find(filter)
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        )
        .sort(getSortOption(req.query.sort))
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .maxTimeMS(10000);

      // Preserve existing admin array response.

      return res.json(
        processProductsForUser(products, req.user)
      );

    } catch (error) {
      console.error(
        'GET /products/admin/all failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to fetch products',
        error: error.message
      });
    }
  }
);

// ==========================================
// GET PRODUCTS GROUPED BY CATEGORY
// GET /api/products/grouped
// ==========================================

router.get('/grouped', optionalAuth, async (req, res) => {
  try {
    const groupedProducts = await Product.aggregate([
      {
        $match: {
          isActive: true
        }
      },

      {
        $sort: {
          createdAt: -1,
          _id: -1
        }
      },

      {
        $group: {
          _id: '$category',
          products: {
            $push: '$$ROOT'
          }
        }
      },

      {
        $sort: {
          _id: 1
        }
      }

    ])
      .allowDiskUse(true)
      .option({
        maxTimeMS: 15000
      });

    const result = groupedProducts.map((group) => ({
      ...group,

      products: processProductsForUser(
        group.products,
        req.user
      )
    }));

    return res.json(result);

  } catch (error) {
    console.error(
      'GET /products/grouped failed:',
      error
    );

    return res.status(500).json({
      message: 'Failed to fetch grouped products',
      error: error.message
    });
  }
});

// ==========================================
// GET PRODUCTS ON SALE
// GET /api/products/on-sale
// ==========================================

router.get('/on-sale', optionalAuth, async (req, res) => {
  try {
    const page = parsePositiveInt(
      req.query.page,
      1,
      1000000
    );

    const limit = parsePositiveInt(
      req.query.limit,
      CATEGORY_PAGE_SIZE,
      CATEGORY_MAX_PAGE_SIZE
    );

    const products = await Product.find({
      isActive: true,

      discountPrice: {
        $gt: 0,
        $ne: null
      }
    })
      .select(
        '+discountPrice +engineeringPrice +assignedSalesRep'
      )
      .sort({
        createdAt: -1,
        _id: -1
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .maxTimeMS(10000);

    return res.json(
      processProductsForUser(products, req.user)
    );

  } catch (error) {
    console.error(
      'GET /products/on-sale failed:',
      error
    );

    return res.status(500).json({
      message: 'Failed to fetch discounted products',
      error: error.message
    });
  }
});

// ==========================================
// GET DISCOUNT AND ENGINEERING PRICES
// USED FOR CART VALIDATION
// ==========================================

router.get(
  '/discount-prices',
  optionalAuth,
  async (req, res) => {
    try {
      const filter = {
        isActive: true
      };

      if (canAlwaysSeeEngPrice(req.user)) {
        filter.$or = [
          {
            discountPrice: {
              $gt: 0,
              $ne: null
            }
          },
          {
            engineeringPrice: {
              $gt: 0,
              $ne: null
            }
          }
        ];
      } else {
        filter.discountPrice = {
          $gt: 0,
          $ne: null
        };
      }

      // Retrieve only fields needed for cart pricing.

      const products = await Product.find(filter)
        .select(
          'name price discountPrice engineeringPrice image category'
        )
        .lean()
        .maxTimeMS(10000);

      const results = products.map((product) => {
        const showEng = canSeeEngPriceForProduct(
          req.user
        );

        const discountPercent =
          product.price > 0 && product.discountPrice
            ? Math.round(
                (
                  (product.price - product.discountPrice) /
                  product.price
                ) * 100
              )
            : 0;

        return {
          _id: product._id,

          name: product.name,

          price: product.price,

          discountPrice:
            product.discountPrice || null,

          ...(showEng
            ? {
                engineeringPrice:
                  product.engineeringPrice || null
              }
            : {}),

          discountPercent,

          image: product.image,

          category: product.category
        };
      });

      return res.json(results);

    } catch (error) {
      console.error(
        'GET /products/discount-prices failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to fetch discount prices',
        error: error.message
      });
    }
  }
);

// ==========================================
// GET PRODUCTS BY CATEGORY
// GET /api/products/category/:categoryName
// ==========================================

router.get(
  '/category/:categoryName',
  optionalAuth,
  async (req, res) => {
    try {
      const categoryName = String(
        req.params.categoryName || ''
      )
        .trim()
        .slice(0, 100);

      if (!categoryName) {
        return res.status(400).json({
          message: 'Category name is required'
        });
      }

      const page = parsePositiveInt(
        req.query.page,
        1,
        1000000
      );

      const limit = parsePositiveInt(
        req.query.limit,
        CATEGORY_PAGE_SIZE,
        CATEGORY_MAX_PAGE_SIZE
      );

      const products = await Product.find({
        isActive: true,

        category: {
          $regex: `^${escapeRegex(categoryName)}$`,
          $options: 'i'
        }
      })
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        )
        .sort({
          createdAt: -1,
          _id: -1
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .maxTimeMS(10000);

      return res.json(
        processProductsForUser(products, req.user)
      );

    } catch (error) {
      console.error(
        'GET /products/category failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to fetch products by category',
        error: error.message
      });
    }
  }
);

// ==========================================
// GET DISCOUNT PRICE FOR ONE PRODUCT
// ==========================================

router.get(
  '/:id/discount-price',
  async (req, res) => {
    try {
      const product = await Product.findById(
        req.params.id
      )
        .select('name price discountPrice')
        .lean()
        .maxTimeMS(8000);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found'
        });
      }

      if (
        !product.discountPrice ||
        product.discountPrice <= 0
      ) {
        return res.status(200).json({
          _id: product._id,
          name: product.name,
          price: product.price,
          discountPrice: null,
          discountPercent: 0,
          hasDiscount: false
        });
      }

      const discountPercent =
        product.price > 0
          ? Math.round(
              (
                (product.price - product.discountPrice) /
                product.price
              ) * 100
            )
          : 0;

      return res.json({
        _id: product._id,
        name: product.name,
        price: product.price,
        discountPrice: product.discountPrice,
        discountPercent,
        hasDiscount: true
      });

    } catch (error) {
      console.error(
        'GET /products/:id/discount-price failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to fetch discount price',
        error: error.message
      });
    }
  }
);

// ==========================================
// GET ONE PRODUCT
// ==========================================

router.get(
  '/:id',
  optionalAuth,
  async (req, res) => {
    try {
      const product = await Product.findById(
        req.params.id
      )
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        )
        .populate(
          'assignedSalesRep',
          'name email'
        )
        .lean()
        .maxTimeMS(8000);

      if (!product) {
        return res.status(404).json({
          message: 'Product not found'
        });
      }

      return res.json(
        canSeeEngPriceForProduct(req.user)
          ? product
          : stripInternalFields(product)
      );

    } catch (error) {
      console.error(
        'GET /products/:id failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to fetch product',
        error: error.message
      });
    }
  }
);

// ==========================================
// CREATE PRODUCT
// ==========================================

router.post(
  '/',
  protect,
  requirePermission('manage_products'),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        discountPrice,
        engineeringPrice,
        category,
        images,
        countInStock,
        brand,
        sku,
        tags,
        isFeatured,
        isNewArrival,
        isFlashSale,
        assignedSalesRep
      } = req.body;

      const cleanedImages = Array.isArray(images)
        ? images.filter(
            (img) =>
              typeof img === 'string' &&
              img.trim()
          )
        : [];

      const canSetPrices = canEditPrices(req.user);

      const finalAssignedRep =
        canAlwaysSeeEngPrice(req.user) &&
        assignedSalesRep
          ? assignedSalesRep
          : undefined;

      const product = await Product.create({
        name,

        description,

        price:
          canSetPrices && price !== undefined
            ? Number(price)
            : undefined,

        discountPrice:
          canSetPrices &&
          discountPrice !== undefined &&
          discountPrice !== null
            ? Number(discountPrice)
            : undefined,

        engineeringPrice:
          canSetPrices &&
          engineeringPrice !== undefined &&
          engineeringPrice !== null
            ? Number(engineeringPrice)
            : undefined,

        category,

        images: cleanedImages,

        image: cleanedImages[0] || '',

        countInStock: Number(countInStock) || 0,

        brand: brand || '',

        sku: sku || '',

        tags: Array.isArray(tags) ? tags : [],

        isFeatured: Boolean(isFeatured),

        isNewArrival: Boolean(isNewArrival),

        isFlashSale: Boolean(isFlashSale),

        assignedSalesRep: finalAssignedRep
      });

      const populated = await Product.findById(
        product._id
      )
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        )
        .populate(
          'assignedSalesRep',
          'name email'
        )
        .lean();

      return res.status(201).json(
        canSeeEngPriceForProduct(req.user)
          ? populated
          : stripInternalFields(populated)
      );

    } catch (error) {
      console.error(
        'POST /products failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to create product',
        error: error.message
      });
    }
  }
);

// ==========================================
// UPDATE PRODUCT
// ==========================================

router.put(
  '/:id',
  protect,
  requirePermission('manage_products'),
  async (req, res) => {
    try {
      const product = await Product.findById(
        req.params.id
      )
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        );

      if (!product) {
        return res.status(404).json({
          message: 'Product not found'
        });
      }

      const {
        name,
        description,
        price,
        discountPrice,
        engineeringPrice,
        category,
        images,
        countInStock,
        brand,
        sku,
        tags,
        isFeatured,
        isNewArrival,
        isFlashSale,
        isActive,
        assignedSalesRep
      } = req.body;

      const canModifyPrices = canEditPrices(
        req.user
      );

      // Standard field updates.

      Object.assign(product, {
        ...(name !== undefined && { name }),

        ...(description !== undefined && {
          description
        }),

        ...(category !== undefined && { category }),

        ...(countInStock !== undefined && {
          countInStock: Number(countInStock)
        }),

        ...(brand !== undefined && { brand }),

        ...(sku !== undefined && { sku }),

        ...(tags !== undefined && { tags }),

        ...(isFeatured !== undefined && {
          isFeatured
        }),

        ...(isNewArrival !== undefined && {
          isNewArrival
        }),

        ...(isFlashSale !== undefined && {
          isFlashSale
        }),

        ...(isActive !== undefined && {
          isActive
        })
      });

      // Selling price permission.

      if (
        price !== undefined &&
        canModifyPrices
      ) {
        product.price = Number(price);
      }

      // Discount price permission.

      if (
        discountPrice !== undefined &&
        canModifyPrices
      ) {
        product.discountPrice =
          discountPrice === null ||
          discountPrice === ''
            ? null
            : Number(discountPrice);
      }

      // Engineering price permission.

      if (
        engineeringPrice !== undefined &&
        canModifyPrices
      ) {
        product.engineeringPrice =
          engineeringPrice === null ||
          engineeringPrice === ''
            ? null
            : Number(engineeringPrice);
      }

      // Sales representative assignment.

      if (
        assignedSalesRep !== undefined &&
        canAlwaysSeeEngPrice(req.user)
      ) {
        product.assignedSalesRep =
          assignedSalesRep || null;
      }

      // Product images.

      if (images !== undefined) {
        const cleanedImages = Array.isArray(images)
          ? images.filter(
              (img) =>
                typeof img === 'string' &&
                img.trim()
            )
          : [];

        product.images = cleanedImages;

        product.image =
          cleanedImages[0] || '';
      }

      await product.save();

      const populated = await Product.findById(
        product._id
      )
        .select(
          '+discountPrice +engineeringPrice +assignedSalesRep'
        )
        .populate(
          'assignedSalesRep',
          'name email'
        )
        .lean();

      return res.json(
        canSeeEngPriceForProduct(req.user)
          ? populated
          : stripInternalFields(populated)
      );

    } catch (error) {
      console.error(
        'PUT /products/:id failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to update product',
        error: error.message
      });
    }
  }
);

// ==========================================
// ASSIGN SALES REPRESENTATIVE
// ==========================================

router.patch(
  '/:id/assign-rep',
  protect,
  requirePermission('manage_products'),
  async (req, res) => {
    try {
      if (!canAlwaysSeeEngPrice(req.user)) {
        return res.status(403).json({
          message:
            'Only Admin, Engineer, or Sales Rep can assign a sales rep'
        });
      }

      const { salesRepId } = req.body;

      if (salesRepId) {
        const repUser = await User.findById(
          salesRepId
        ).select('role');

        if (!repUser) {
          return res.status(404).json({
            message: 'User not found'
          });
        }

        if (repUser.role !== 'sales_rep') {
          return res.status(400).json({
            message:
              'Assigned user must have the sales_rep role'
          });
        }
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            assignedSalesRep: salesRepId || null
          }
        },
        {
          new: true,
          runValidators: true
        }
      )
        .select('+assignedSalesRep')
        .populate(
          'assignedSalesRep',
          'name email'
        )
        .lean();

      if (!product) {
        return res.status(404).json({
          message: 'Product not found'
        });
      }

      return res.json(product);

    } catch (error) {
      console.error(
        'PATCH /products/:id/assign-rep failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to assign sales rep',
        error: error.message
      });
    }
  }
);

// ==========================================
// DELETE PRODUCT
// ==========================================

router.delete(
  '/:id',
  protect,
  requirePermission('manage_products'),
  async (req, res) => {
    try {
      const product = await Product.findByIdAndDelete(
        req.params.id
      );

      if (!product) {
        return res.status(404).json({
          message: 'Product not found'
        });
      }

      return res.json({
        message: 'Product deleted successfully'
      });

    } catch (error) {
      console.error(
        'DELETE /products/:id failed:',
        error
      );

      return res.status(500).json({
        message: 'Failed to delete product',
        error: error.message
      });
    }
  }
);

export default router;