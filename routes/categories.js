// routes/categoryRoutes.js
import express from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
// ✅ UPDATED: Import requirePermission instead of isAdmin
import { protect, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET all categories (public, paginated)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, showInSidebar, showInHome, showInCatalog, isActive } = req.query;
    let filter = {};

    if (showInSidebar === 'true') filter.showInSidebar = true;
    if (showInHome === 'true') filter.showInHome = true;
    if (showInCatalog === 'true') filter.showInCatalog = true;
    if (isActive === 'true') filter.isActive = true;

    const skip = (Number(page) - 1) * Number(limit);

    const [categories, total] = await Promise.all([
      Category.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(Number(limit)),
      Category.countDocuments(filter)
    ]);

    res.json({
      categories,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
});

// GET single category (public)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error: error.message });
  }
});

// POST create category (Admin OR Sales Rep with "manage_categories" permission)
router.post('/', protect, requirePermission("manage_categories"), async (req, res) => {
  // Simple manual validation instead of express-validator
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ message: 'Category name is required' });
  }

  try {
    const { icon, image, description, showInSidebar, showInCatalog, showInHome, sortOrder } = req.body;

    const category = await Category.create({
      name: name.trim(),
      icon: icon || 'lucide:Package',
      image: image || '',
      description: description || '',
      showInSidebar: showInSidebar === true,
      showInCatalog: showInCatalog === true,
      showInHome: showInHome === true,
      sortOrder: sortOrder || 0,
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    res.status(500).json({ message: 'Failed to create category', error: error.message });
  }
});

// PUT update category (Admin OR Sales Rep with "manage_categories" permission)
router.put('/:id', protect, requirePermission("manage_categories"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const { name, icon, image, description, showInSidebar, showInCatalog, showInHome, sortOrder, isActive } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.status(400).json({ message: 'Category name cannot be empty' });
    }

    Object.assign(category, {
      ...(name && { name: name.trim() }),
      ...(icon !== undefined && { icon }),
      ...(image !== undefined && { image }),
      ...(description !== undefined && { description }),
      ...(showInSidebar !== undefined && { showInSidebar }),
      ...(showInCatalog !== undefined && { showInCatalog }),
      ...(showInHome !== undefined && { showInHome }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    });

    await category.save();
    res.json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }
    res.status(500).json({ message: 'Failed to update category', error: error.message });
  }
});

// DELETE category (Admin OR Sales Rep with "manage_categories" permission)
router.delete('/:id', protect, requirePermission("manage_categories"), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete category', error: error.message });
  }
});

export default router;