const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true  // One active subscription per user
  },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'cancelled'], 
    default: 'active' 
  },
  plan: {
    type: String,
    enum: ['monthly'],
    default: 'monthly'
  },
  amount: { 
    type: Number, 
    required: true 
  },
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  payloqaTransactionId: { 
    type: String 
  },
  autoRenew: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index so expiry checks are fast
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ expiresAt: 1 });

// Virtual: is the subscription currently valid?
subscriptionSchema.virtual('isValid').get(function () {
  return this.status === 'active' && this.expiresAt > new Date();
});

module.exports = mongoose.model('Subscription', subscriptionSchema);