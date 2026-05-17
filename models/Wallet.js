import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  coins: {
    type: Number,
    default: 0,
    min: 0,
  },
}, { timestamps: true });

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;