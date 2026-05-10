import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, unique: true }, 
  icon: { type: String, default: 'lucide:package' },
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  showInSidebar: { type: Boolean, default: true },
  showInCatalog: { type: Boolean, default: true },
  showInHome: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ✅ FIXED: Removed 'next', using modern async function
categorySchema.pre('save', async function() {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  // No need to call next() anymore!
});

export default mongoose.model('Category', categorySchema);