const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referredUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'rewarded'], default: 'pending' },
  rewardAmount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Referral', referralSchema);
