// models/Activity.js
import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    type: { 
      type: String, 
      required: true, 
      enum: ["order", "user", "stock", "payment", "cart", "cart_abandoned", "settings"] 
    },
    message: { 
      type: String, 
      required: true 
    },
    referenceId: { 
      type: String 
    },
    performedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      default: null
    },
    metadata: { 
      type: mongoose.Schema.Types.Mixed 
    }
  },
  { timestamps: true } 
);

// Index to make querying the latest activities fast
activitySchema.index({ createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;