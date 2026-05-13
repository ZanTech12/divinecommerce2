import express from 'express';
import Product from '../models/Product.js';
import { protect, isAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET all products (public)
router.get('/', async (req, res) => {
  try {
    const { category, subcategory, featured, newArrival, flashSale, search, sort, limit, page } = req.query;
    let filter = { isActive: true };

    // Case-insensitive category matching so "phones" matches "Phones"
    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    // Add subcategory support in case you use it in the future
    if (subcategory) {
      filter.subcategory = { $regex: new RegExp(`^${subcategory}$`, 'i') };
    }

    if (featured === 'true') filter.isFeatured = true;
    if (newArrival === 'true') filter.isNewArrival = true;
    if (flashSale === 'true') filter.isFlashSale = true;
    
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
    
    // FIX: Default limit set to 0. In MongoDB, a limit of 0 means NO LIMIT.
    // This ensures the Home page gets ALL products to display in categories, 
    // rather than cutting off at 50.
    const limitNum = parseInt(limit) || 0; 
    
    const skip = (pageNum - 1) * limitNum;

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

// GET single product (public)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch product', error: error.message });
  }
});

// POST create product (admin only)
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const {
      name, description, price, discountPrice, category,
      image, images, countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale
    } = req.body;

    const product = await Product.create({
      name,
      description,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : undefined,
      category,
      image: image || '',
      images: images || [],
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

// PUT update product (admin only)
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const {
      name, description, price, discountPrice, category,
      image, images, countInStock, brand, sku, tags,
      isFeatured, isNewArrival, isFlashSale, isActive
    } = req.body;

    Object.assign(product, {
      ...(name && { name }),
      ...(description && { description }),
      ...(price !== undefined && { price: Number(price) }),
      ...(discountPrice !== undefined && { discountPrice: discountPrice ? Number(discountPrice) : undefined }),
      ...(category && { category }),
      ...(image !== undefined && { image }),
      ...(images !== undefined && { images }),
      ...(countInStock !== undefined && { countInStock: Number(countInStock) }),
      ...(brand !== undefined && { brand }),
      ...(sku !== undefined && { sku }),
      ...(tags !== undefined && { tags }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(isNewArrival !== undefined && { isNewArrival }),
      ...(isFlashSale !== undefined && { isFlashSale }),
      ...(isActive !== undefined && { isActive }),
    });

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