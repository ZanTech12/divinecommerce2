// controllers/inviteController.js
import crypto from 'crypto';
import InviteToken from '../models/InviteToken.js';

// Generate a new random invite token
export const generateInviteToken = async (req, res) => {
  const { expiresAt } = req.body;

  if (!expiresAt) {
    return res.status(400).json({ message: "Expiry date is required." });
  }

  if (new Date(expiresAt) <= new Date()) {
    return res.status(400).json({ message: "Expiry date must be in the future." });
  }

  try {
    // Generate a secure, random 8-character alphanumeric code
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();

    const newToken = await InviteToken.create({
      token,
      expiresAt: new Date(expiresAt),
      createdBy: req.user._id, // Comes from auth middleware
    });

    res.status(201).json(newToken);
  } catch (error) {
    console.error("Generate token error:", error);
    res.status(500).json({ message: "Failed to generate token." });
  }
};

// Get all tokens (for admin dashboard)
export const getInviteTokens = async (req, res) => {
  try {
    const tokens = await InviteToken.find()
      .sort({ createdAt: -1 })
      .populate('usedBy', 'name email');
      
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tokens." });
  }
};

// Delete/Revoke a token
export const deleteInviteToken = async (req, res) => {
  try {
    const token = await InviteToken.findByIdAndDelete(req.params.id);
    if (!token) return res.status(404).json({ message: "Token not found." });
    res.json({ message: "Token revoked successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete token." });
  }
};