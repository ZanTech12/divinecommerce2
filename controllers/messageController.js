// controllers/messageController.js
import Message from "../models/Message.js";

// @desc    Get all active messages (public)
// @route   GET /api/messages
export const getMessages = async (req, res) => {
  try {
    const { active } = req.query;

    let filter = {};
    if (active === "true") {
      filter.isActive = true;
    }

    const messages = await Message.find(filter).sort({ order: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

// @desc    Get a single message
// @route   GET /api/messages/:id
export const getMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Get message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch message",
      error: error.message,
    });
  }
};

// @desc    Create a new message/slide
// @route   POST /api/messages
export const createMessage = async (req, res) => {
  try {
    const { bg, tag, title, sub, price, img, link, order, isActive } = req.body;

    // Validate required fields
    if (!tag || !title) {
      return res.status(400).json({
        success: false,
        message: "Tag and title are required fields",
      });
    }

    // If no order specified, put it at the end
    if (order === undefined || order === null) {
      const lastMessage = await Message.findOne().sort({ order: -1 });
      req.body.order = lastMessage ? lastMessage.order + 1 : 0;
    }

    const message = await Message.create(req.body);

    res.status(201).json({
      success: true,
      data: message,
      message: "Slide created successfully",
    });
  } catch (error) {
    console.error("Create message error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create message",
      error: error.message,
    });
  }
};

// @desc    Update a message/slide
// @route   PUT /api/messages/:id
export const updateMessage = async (req, res) => {
  try {
    const { bg, tag, title, sub, price, img, link, order, isActive } = req.body;

    const message = await Message.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    res.status(200).json({
      success: true,
      data: message,
      message: "Slide updated successfully",
    });
  } catch (error) {
    console.error("Update message error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update message",
      error: error.message,
    });
  }
};

// @desc    Delete a message/slide
// @route   DELETE /api/messages/:id
export const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Slide deleted successfully",
      data: message,
    });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error.message,
    });
  }
};

// @desc    Reorder slides
// @route   PUT /api/messages/reorder
export const reorderMessages = async (req, res) => {
  try {
    const { orders } = req.body; // Array of { id, order }

    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({
        success: false,
        message: "orders array is required",
      });
    }

    const bulkOps = orders.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id },
        update: { order },
      },
    }));

    await Message.bulkWrite(bulkOps);

    const messages = await Message.find().sort({ order: 1 });

    res.status(200).json({
      success: true,
      data: messages,
      message: "Slides reordered successfully",
    });
  } catch (error) {
    console.error("Reorder messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reorder messages",
      error: error.message,
    });
  }
};

// @desc    Toggle active status
// @route   PATCH /api/messages/:id/toggle
export const toggleMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    message.isActive = !message.isActive;
    await message.save();

    res.status(200).json({
      success: true,
      data: message,
      message: `Slide ${message.isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Toggle message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle message",
      error: error.message,
    });
  }
};