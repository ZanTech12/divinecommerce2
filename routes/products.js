import express from 'express';
import Product from '../models/Product.js';
import jwt from 'jsonwebtoken';            // ✅ NEW
import User from '../models/User.js';       // ✅ NEW
import { protect, isAdmin, isEngineer } from '../middleware/authMiddleware.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// OPTIONAL AUTH: Attaches req.user if a valid token is
// present, but does NOT reject unauthenticated requests.
// This lets public endpoints conditionally expose fields
// (like engineeringPrice) to admin/engineer users.
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

// ✅ Helper: can this user see engineering price?
const canSeeEngPrice = (user) => user && ['admin', 'engineer'].includes(user.role);

// ─────────────────────────────────────────────────────
// HELPER: Strip internal fields for public responses
// ─────────────────────────────────────────────────────
const stripInternalFields = (product) => {
  const obj = product.toObject ? product.toObject() : product;
  const { engineeringPrice, ...publicData } = obj;
  return publicData;
};

const stripInternalFieldsArray = (products) => products.map(stripInternalFields);

// GET all products (optionally includes engineeringPrice for admin/engineer)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, subcategory, featured, newArrival, flashSale, onSale, search, sort, limit, page } = req.query;
    let filter = { isActive: true };

    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    if (subcategory) {
      filter.subcategory = { $regex: new RegExp(`^${subcategory}$`, 'i') };
    }

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

    // ✅ Conditionally select engineeringPrice
    const showEng = canSeeEngPrice(req.user);
    let selectFields = '+discountPrice';
    if (showEng) selectFields += ' +engineeringPrice';

    const products = await Product.find(filter)
      .select(selectFields)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);

    // ✅ Strip engineeringPrice only for non-admin/engineer
    res.json(showEng ? products : stripInternalFieldsArray(products));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

// ✅ GET all products WITH engineeringPrice (admin/engineer only — kept for explicit admin pages)
router.get('/admin/all', protect, async (req, res) => {
  try {
    if (!['admin', 'engineer'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

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
      .select('+discountPrice +engineeringPrice')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

// GET products grouped by category (optionally includes engineeringPrice for admin/engineer)
router.get('/grouped', optionalAuth, async (req, res) => {
  try {
    const showEng = canSeeEngPrice(req.user);

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

    // ✅ Conditionally strip engineeringPrice
    const result = showEng
      ? groupedProducts
      : groupedProducts.map(group => ({
          ...group,
          products: group.products.map(({ engineeringPrice, ...rest }) => rest)
        }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch grouped products', error: error.message });
  }
});

// GET products that have a discountPrice (optionally includes engineeringPrice for admin/engineer)
router.get('/on-sale', optionalAuth, async (req, res) => {
  try {
    const showEng = canSeeEngPrice(req.user);

    let selectFields = '+discountPrice';
    if (showEng) selectFields += ' +engineeringPrice';

    const products = await Product.find({
      isActive: true,
      discountPrice: { $exists: true, $ne: null, $gt: 0 }
    })
      .select(selectFields)
      .sort({ createdAt: -1 });

    res.json(showEng ? products : stripInternalFieldsArray(products));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch discounted products', error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ✅ UPDATED: GET discount & engineering prices for Cart validation
// Now uses optionalAuth to securely pass engineeringPrice to engineers
// ═══════════════════════════════════════════════════════════
router.get('/discount-prices', optionalAuth, async (req, res) => {
  try {
    const showEng = canSeeEngPrice(req.user);

    // If admin/engineer, fetch products that have EITHER a discount or engineering price
    // If public, only fetch products that have a discount price
    let filter = { isActive: true };
    
    if (showEng) {
      filter.$or = [
        { discountPrice: { $exists: true, $ne: null, $gt: 0 } },
        { engineeringPrice: { $exists: true, $ne: null, $gt: 0 } }
      ];
    } else {
      filter.discountPrice = { $exists: true, $ne: null, $gt: 0 };
    }

    let selectFields = 'name price discountPrice image category';
    if (showEng) selectFields += ' engineeringPrice';

    const products = await Product.find(filter)
      .select(selectFields)
      .sort({ createdAt: -1 });

    const results = products.map((product) => {
      const obj = product.toObject ? product.toObject() : product;
      
      const discountPercent = obj.price > 0 && obj.discountPrice
        ? Math.round(((obj.price - obj.discountPrice) / obj.price) * 100)
        : 0;

      return {
        _id: obj._id,
        name: obj.name,
        price: obj.price,
        discountPrice: obj.discountPrice || null,
        engineeringPrice: showEng ? (obj.engineeringPrice || null) : undefined, // ✅ Conditionally add engineeringPrice
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

// GET products by category name (optionally includes engineeringPrice for admin/engineer)
router.get('/category/:categoryName', optionalAuth, async (req, res) => {
  try {
    const showEng = canSeeEngPrice(req.user);

    let selectFields = '+discountPrice';
    if (showEng) selectFields += ' +engineeringPrice';

    const products = await Product.find({
      isActive: true,
      category: { $regex: new RegExp(`^${req.params.categoryName}$`, 'i') }
    })
      .select(selectFields)
      .sort({ createdAt: -1 });

    res.json(showEng ? products : stripInternalFieldsArray(products));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products by category', error: error.message });
  }
});

// GET discountPrice for a single product (public)
router.get('/:id/discount-price', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select(
      'name price discountPrice'
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

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

// GET single product (optionally includes engineeringPrice for admin/engineer)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const showEng = canSeeEngPrice(req.user);

    let selectFields = '+discountPrice';
    if (showEng) selectFields += ' +engineeringPrice';

    const product = await Product.findById(req.params.id).select(selectFields);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json(showEng ? product : stripInternalFields(product));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch product', error: error.message });
  }
});

// POST create product (admin only — accepts engineeringPrice)
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const {
      name, description, price, discountPrice, engineeringPrice, category,
      images,
      countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale
    } = req.body;

    const cleanedImages = (images || []).filter((img) => img && img.trim());

    const product = await Product.create({
      name,
      description,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : undefined,
      engineeringPrice: engineeringPrice ? Number(engineeringPrice) : undefined,
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
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create product', error: error.message });
  }
});

// PUT update product (admin only — accepts engineeringPrice)
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      name, description, price, discountPrice, engineeringPrice, category,
      images,
      countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale, isActive
    } = req.body;

    Object.assign(product, {
      ...(name && { name }),
      ...(description && { description }),
      ...(price !== undefined && { price: Number(price) }),
      ...(discountPrice !== undefined && { discountPrice: discountPrice ? Number(discountPrice) : undefined }),
      ...(engineeringPrice !== undefined && { engineeringPrice: engineeringPrice ? Number(engineeringPrice) : undefined }),
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
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update product', error: error.message });
  }
});

// DELETE product (admin only)
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete product', error: error.message });
  }
});

export default router;