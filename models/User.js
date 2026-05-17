import mongoose from "mongoose";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "Please provide a name"],
    trim: true 
  },
  email: { 
    type: String, 
    required: [true, "Please provide an email"],
    unique: true, 
    lowercase: true,
    trim: true 
  },
  phone: { 
    type: String, 
    required: [function() { return this.isNew; }, "Please provide a phone number"],
    unique: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^\+?0?[1-9]\d{8,13}$/.test(v);
      },
      message: (props) => `${props.value} is not a valid phone number!`
    }
  },
  password: { 
    type: String, 
    required: [true, "Please provide a password"],
    minlength: 6 
  },
  role: { 
    type: String, 
    enum: ["user", "admin", "engineer"], 
    default: "user" 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  otp: { 
    type: String, 
    select: false 
  },
  otpExpires: { 
    type: Date,
    select: false 
  },
  coins: {
     type: Number, 
     default: 0 
    },
}, { 
  timestamps: true 
});

// Hash password before saving
userSchema.pre("save", function () {
  if (!this.isModified("password")) return;
  
  this.password = crypto.createHash("sha256")
    .update(this.password)
    .digest("hex");
});

// ⚠️ CRITICAL: This is the block that was accidentally deleted!
userSchema.methods.matchPassword = function (enteredPassword) {
  const hashed = crypto.createHash("sha256")
    .update(enteredPassword)
    .digest("hex");
  return this.password === hashed;
};

export default mongoose.model("User", userSchema);