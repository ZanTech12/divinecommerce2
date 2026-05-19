import mongoose from 'mongoose';

const siteSettingsSchema = new mongoose.Schema({
  companyName: { type: String, default: 'MallHub' },
  companyTagline: { type: String, default: 'Your One-Stop Online Mall' },
  logo: { type: String, default: '' },
  favicon: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  phone2: { type: String, default: '' },
  email: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  facebook: { type: String, default: '' },
  instagram: { type: String, default: '' },
  twitter: { type: String, default: '' },
  tiktok: { type: String, default: '' },
  youtube: { type: String, default: '' },
  currency: { type: String, default: '₦' },
  currencyCode: { type: String, default: 'NGN' },
  freeDeliveryThreshold: { type: Number, default: 150 },
  returnDays: { type: Number, default: 30 },
  supportHours: { type: String, default: '24/7' },
  footerText: { type: String, default: '© 2025 MallHub. All rights reserved.' },
  aboutUs: { type: String, default: '' },
  privacyPolicy: { type: String, default: '' },
  termsOfService: { type: String, default: '' },
  heroSlides: [{
    bg: { type: String, default: '' },
    tag: { type: String, default: '' },
    title: { type: String, default: '' },
    sub: { type: String, default: '' },
    price: { type: String, default: '' },
    img: { type: String, default: '' },
    link: { type: String, default: '/products' },
  }],
  sidePromos: [{
    bg: { type: String, default: '' },
    tag: { type: String, default: '' },
    title: { type: String, default: '' },
    price: { type: String, default: '' },
    img: { type: String, default: '' },
    link: { type: String, default: '/products' },
  }],
  promoBanners: [{
    img: { type: String, default: '' },
    tag: { type: String, default: '' },
    title: { type: String, default: '' },
    sub: { type: String, default: '' },
    cta: { type: String, default: '' },
    ctaStyle: { type: String, default: 'dark' },
    link: { type: String, default: '/products' },
  }],
  popularSearches: [{
    term: { type: String, default: '' },
    price: { type: String, default: '' },
  }],
  officialStores: [{
    name: { type: String, default: '' },
    color: { type: String, default: '#555' },
    price: { type: String, default: '' },
    initial: { type: String, default: '' },
    image: { type: String, default: '' },
  }],
  services: [{
    icon: { type: String, default: '' },
    label: { type: String, default: '' },
    sub: { type: String, default: '' },
  }],
  appStoreLink: { type: String, default: '' },
  googlePlayLink: { type: String, default: '' },
}, { timestamps: true });

// Singleton pattern - only one settings document
siteSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model('SiteSettings', siteSettingsSchema);