// routes/productRoutes.js
import express from 'express';
import Product from '../models/Product.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// OPTIONAL AUTH
// ═══════════════════════════════════════════════════════════
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    }
  } catch (error) {
    // Invalid / expired token — continue as unauthenticated
  }
  next();
};

// ─────────────────────────────────────────────────────
// HELPERS: Engineering price visibility (unchanged)
// ─────────────────────────────────────────────────────

// ✅ Admin/Engineer can ALWAYS see engineering price
const canAlwaysSeeEngPrice = (user) => user && ['admin', 'engineer'].includes(user.role);

// ✅ Sales Rep can see engineering price ONLY if assigned to this product
const canSeeEngPriceForProduct = (user, product) => {
  if (!user) return false;
  if (canAlwaysSeeEngPrice(user)) return true;
  if (user.role === 'sales_rep') {
    const assignedId = product.assignedSalesRep?.toString();
    return assignedId && assignedId === user._id.toString();
  }
  return false;
};

// Strip engineeringPrice for a single product
const stripInternalFields = (product) => {
  const obj = product.toObject ? product.toObject() : product;
  const { engineeringPrice, ...publicData } = obj;
  return publicData;
};

// ✅ Process an array of products — per-product stripping for sales reps
const processProductsForUser = (products, user) => {
  if (!user) return products.map(stripInternalFields);
  if (canAlwaysSeeEngPrice(user)) return products;

  // Sales rep: see engineeringPrice only on products they're assigned to
  if (user.role === 'sales_rep') {
    return products.map(product => {
      if (canSeeEngPriceForProduct(user, product)) return product;
      return stripInternalFields(product);
    });
  }

  return products.map(stripInternalFields);
};

// ─────────────────────────────────────────────────────
// HELPER: Price editing permission
// Only admin and sales_rep can add/edit/delete
// discountPrice, sellingPrice (price), and engineeringPrice
// ─────────────────────────────────────────────────────
const canEditPrices = (user, product = null) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'sales_rep') {
    // For new products (no product yet), any sales_rep can set prices
    if (!product) return true;
    // For existing products, only the assigned sales_rep can edit prices
    const assignedId = product.assignedSalesRep?.toString();
    return assignedId && assignedId === user._id.toString();
  }
  return false;
};

// ─────────────────────────────────────────────────────
// GET all products
// ─────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, subcategory, featured, newArrival, flashSale, onSale, search, sort, limit, page } = req.query;
    let filter = { isActive: true };

    if (category) filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    if (subcategory) filter.subcategory = { $regex: new RegExp(`^${subcategory}$`, 'i') };
    if (featured === 'true') filter.isFeatured = true;
    if (newArrival === 'true') filter.isNewArrival = true;
    if (flashSale === 'true') filter.isFlashSale = true;
    if (onSale === 'true') {
      filter.discountPrice = { $exists: true, $ne: null, $gt: 0 };
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };
    if (sort === 'name') sortOption = { name: 1 };
    if (sort === 'rating') sortOption = { rating: -1 };
    if (sort === 'newest') sortOption = { createdAt: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 0;
    const skip = (pageNum - 1) * limitNum;

    const products = await Product.find(filter)
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);
    const processed = processProductsForUser(products, req.user);

    if (limitNum > 0) {
      res.json({ products: processed, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    } else {
      res.json(processed);
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET all products (admin page)
// ─────────────────────────────────────────────────────
router.get('/admin/all', protect, requirePermission('manage_products'), async (req, res) => {
  try {
    const { search, sort, limit, page, category, featured, newArrival, flashSale, onSale } = req.query;
    let filter = {};

    if (category) filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    if (featured === 'true') filter.isFeatured = true;
    if (newArrival === 'true') filter.isNewArrival = true;
    if (flashSale === 'true') filter.isFlashSale = true;
    if (onSale === 'true') {
      filter.discountPrice = { $exists: true, $ne: null, $gt: 0 };
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };
    if (sort === 'name') sortOption = { name: 1 };
    if (sort === 'newest') sortOption = { createdAt: -1 };

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 0;
    const skip = (pageNum - 1) * limitNum;

    const products = await Product.find(filter)
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const processed = processProductsForUser(products, req.user);
    res.json(processed);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET products grouped by category
// ─────────────────────────────────────────────────────
router.get('/grouped', optionalAuth, async (req, res) => {
  try {
    const groupedProducts = await Product.aggregate([
      { $match: { isActive: true } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$category",
          products: { $push: "$$ROOT" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const result = groupedProducts.map(group => ({
      ...group,
      products: processProductsForUser(group.products, req.user)
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grouped products', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET products on sale
// ─────────────────────────────────────────────────────
router.get('/on-sale', optionalAuth, async (req, res) => {
  try {
    const products = await Product.find({
      isActive: true,
      discountPrice: { $exists: true, $ne: null, $gt: 0 }
    })
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .sort({ createdAt: -1 });

    res.json(processProductsForUser(products, req.user));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch discounted products', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET discount & engineering prices for Cart validation
// ─────────────────────────────────────────────────────
router.get('/discount-prices', optionalAuth, async (req, res) => {
  try {
    let filter = { isActive: true };

    if (canAlwaysSeeEngPrice(req.user)) {
      filter.$or = [
        { discountPrice: { $exists: true, $ne: null, $gt: 0 } },
        { engineeringPrice: { $exists: true, $ne: null, $gt: 0 } }
      ];
    } else {
      filter.discountPrice = { $exists: true, $ne: null, $gt: 0 };
    }

    const products = await Product.find(filter)
      .select('name price discountPrice engineeringPrice assignedSalesRep image category')
      .sort({ createdAt: -1 });

    const results = products.map((product) => {
      const obj = product.toObject ? product.toObject() : product;
      const showEng = canSeeEngPriceForProduct(req.user, obj);

      const discountPercent = obj.price > 0 && obj.discountPrice
        ? Math.round(((obj.price - obj.discountPrice) / obj.price) * 100)
        : 0;

      return {
        _id: obj._id,
        name: obj.name,
        price: obj.price,
        discountPrice: obj.discountPrice || null,
        engineeringPrice: showEng ? (obj.engineeringPrice || null) : undefined,
        discountPercent,
        image: obj.image,
        category: obj.category,
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch discount prices', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET products by category name
// ─────────────────────────────────────────────────────
router.get('/category/:categoryName', optionalAuth, async (req, res) => {
  try {
    const products = await Product.find({
      isActive: true,
      category: { $regex: new RegExp(`^${req.params.categoryName}$`, 'i') }
    })
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .sort({ createdAt: -1 });

    res.json(processProductsForUser(products, req.user));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products by category', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET discountPrice for a single product (public)
// ─────────────────────────────────────────────────────
router.get('/:id/discount-price', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select(
      'name price discountPrice'
    );

    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (!product.discountPrice || product.discountPrice <= 0) {
      return res.status(200).json({
        _id: product._id,
        name: product.name,
        price: product.price,
        discountPrice: null,
        discountPercent: 0,
        hasDiscount: false,
      });
    }

    const discountPercent =
      product.price > 0
        ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
        : 0;

    res.json({
      _id: product._id,
      name: product.name,
      price: product.price,
      discountPrice: product.discountPrice,
      discountPercent,
      hasDiscount: true,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch discount price', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// GET single product
// ─────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .populate('assignedSalesRep', 'name email');

    if (!product) return res.status(404).json({ message: 'Product not found' });

    const showEng = canSeeEngPriceForProduct(req.user, product);

    if (showEng) {
      res.json(product);
    } else {
      res.json(stripInternalFields(product));
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch product', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// POST create product
// ✅ Only admin and sales_rep can set price, discountPrice, engineeringPrice
// ─────────────────────────────────────────────────────
router.post('/', protect, requirePermission('manage_products'), async (req, res) => {
  try {
    const {
      name, description, price, discountPrice, engineeringPrice, category,
      images, countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale,
      assignedSalesRep,
    } = req.body;

    const cleanedImages = (images || []).filter((img) => img && img.trim());

    // ✅ Only admin and sales_rep can set prices on creation
    const canSetPrices = canEditPrices(req.user, null);

    const finalPrice = canSetPrices && price ? Number(price) : undefined;
    const finalDiscountPrice = canSetPrices && discountPrice ? Number(discountPrice) : undefined;
    const finalEngPrice = canSetPrices && engineeringPrice ? Number(engineeringPrice) : undefined;

    // assignedSalesRep: only admin/engineer can set
    const finalAssignedRep = canAlwaysSeeEngPrice(req.user) && assignedSalesRep
      ? assignedSalesRep
      : undefined;

    const product = await Product.create({
      name,
      description,
      price: finalPrice,
      discountPrice: finalDiscountPrice,
      engineeringPrice: finalEngPrice,
      category,
      images: cleanedImages,
      image: cleanedImages[0] || "",
      countInStock: Number(countInStock) || 0,
      brand: brand || '',
      sku: sku || '',
      tags: tags || [],
      isFeatured: isFeatured || false,
      isNewArrival: isNewArrival || false,
      isFlashSale: isFlashSale || false,
      assignedSalesRep: finalAssignedRep,
    });

    const populated = await Product.findById(product._id)
      .populate('assignedSalesRep', 'name email');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create product', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// PUT update product
// ✅ Only admin and sales_rep can modify price, discountPrice, engineeringPrice
// ─────────────────────────────────────────────────────
router.put('/:id', protect, requirePermission('manage_products'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('+discountPrice +engineeringPrice +assignedSalesRep');

    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      name, description, price, discountPrice, engineeringPrice, category,
      images, countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale, isActive,
      assignedSalesRep,
    } = req.body;

    const isAdminOrEngineer = canAlwaysSeeEngPrice(req.user);
    const canModifyPrices = canEditPrices(req.user, product);

    // ── Standard field updates ──
    Object.assign(product, {
      ...(name && { name }),
      ...(description && { description }),
      ...(category && { category }),
      ...(countInStock !== undefined && { countInStock: Number(countInStock) }),
      ...(brand !== undefined && { brand }),
      ...(sku !== undefined && { sku }),
      ...(tags !== undefined && { tags }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(isNewArrival !== undefined && { isNewArrival }),
      ...(isFlashSale !== undefined && { isFlashSale }),
      ...(isActive !== undefined && { isActive }),
    });

    // ✅ SELLING PRICE: Only admin or sales_rep can modify
    if (price !== undefined && canModifyPrices) {
      product.price = Number(price);
    }

    // ✅ DISCOUNT PRICE: Only admin or sales_rep can modify
    if (discountPrice !== undefined && canModifyPrices) {
      product.discountPrice = discountPrice ? Number(discountPrice) : undefined;
    }

    // ✅ ENGINEERING PRICE: Only admin or sales_rep can modify
    if (engineeringPrice !== undefined && canModifyPrices) {
      product.engineeringPrice = engineeringPrice ? Number(engineeringPrice) : undefined;
    }

    // ✅ ASSIGNED SALES REP: Only Admin/Engineer can change assignment (unchanged)
    if (assignedSalesRep !== undefined && isAdminOrEngineer) {
      product.assignedSalesRep = assignedSalesRep || null;
    }

    if (images !== undefined) {
      const cleanedImages = images.filter((img) => img && img.trim());
      if (cleanedImages.length > 0) {
        product.images = cleanedImages;
        product.image = cleanedImages[0];
      } else {
        product.images = [];
        product.image = "";
      }
    }

    await product.save();

    const populated = await Product.findById(product._id)
      .select('+discountPrice +engineeringPrice +assignedSalesRep')
      .populate('assignedSalesRep', 'name email');

    // ✅ Strip engineeringPrice if requester shouldn't see it
    const showEng = canSeeEngPriceForProduct(req.user, populated);
    res.json(showEng ? populated : stripInternalFields(populated));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update product', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// ✅ Assign a sales rep to a product (Admin/Engineer only) — unchanged
// ─────────────────────────────────────────────────────
router.patch('/:id/assign-rep', protect, requirePermission('manage_products'), async (req, res) => {
  try {
    if (!canAlwaysSeeEngPrice(req.user)) {
      return res.status(403).json({ message: 'Only Admin or Engineer can assign a sales rep' });
    }

    const { salesRepId } = req.body;

    if (salesRepId) {
      const repUser = await User.findById(salesRepId);
      if (!repUser) return res.status(404).json({ message: 'User not found' });
      if (repUser.role !== 'sales_rep') {
        return res.status(400).json({ message: 'Assigned user must have the sales_rep role' });
      }
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.assignedSalesRep = salesRepId || null;
    await product.save();

    const populated = await Product.findById(product._id)
      .populate('assignedSalesRep', 'name email');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign sales rep', error: error.message });
  }
});

// ─────────────────────────────────────────────────────
// DELETE product
// ─────────────────────────────────────────────────────
router.delete('/:id', protect, requirePermission('manage_products'), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete product', error: error.message });
  }
});

export default router;