import express from 'express';
import SiteSettings from '../models/SiteSettings.js';
import { protect, isAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET settings (public)
router.get('/', async (req, res) => {
  try {
    const settings = await SiteSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch settings', error: error.message });
  }
});

// PUT settings (admin only)
router.put('/', protect, isAdmin, async (req, res) => {
  try {
    let settings = await SiteSettings.getSettings();
    Object.assign(settings, req.body);
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update settings', error: error.message });
  }
});

// PATCH specific section (admin only)
router.patch('/:section', protect, isAdmin, async (req, res) => {
  try {
    const { section } = req.params;
    const allowedSections = [
      'heroSlides', 'sidePromos', 'promoBanners', 'popularSearches',
      'officialStores', 'services', 'socialLinks'
    ];

    if (!allowedSections.includes(section)) {
      return res.status(400).json({ message: 'Invalid section' });
    }

    let settings = await SiteSettings.getSettings();
    settings[section] = req.body;
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update section', error: error.message });
  }
});

export default router;