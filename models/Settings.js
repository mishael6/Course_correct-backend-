const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // There will only ever be ONE settings document
  singleton: { type: Boolean, default: true, unique: true },

  // Pricing
  subscriptionPrice: { type: Number, default: 15 },
  minUploadPrice: { type: Number, default: 1 },
  maxUploadPrice: { type: Number, default: 100 },

  // Commission
  uploaderCommissionPercent: { type: Number, default: 80 }, // uploader gets 80%

  // Upload limits
  maxFileSizeMB: { type: Number, default: 10 },

  // Platform info
  platformName: { type: String, default: 'CourseCorrect' },
  supportEmail: { type: String, default: '' },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);