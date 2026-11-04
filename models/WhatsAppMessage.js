import mongoose from 'mongoose';

const whatsappMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    phoneNumber: {
      type: String,
      required: true,
      index: true
    },

    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true
    },

    messageType: {
      type: String,
      default: 'text'
    },

    messageText: {
      type: String,
      default: ''
    },

    status: {
      type: String,
      default: 'received'
    },

    replyStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'not_required'],
      default: 'not_required'
    },

    timestamp: {
      type: Date,
      default: Date.now
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

const WhatsAppMessage =
  mongoose.models.WhatsAppMessage ||
  mongoose.model('WhatsAppMessage', whatsappMessageSchema);

export default WhatsAppMessage;