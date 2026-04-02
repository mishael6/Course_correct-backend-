const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  upload: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Upload', 
    default: null   // null for subscription payments
  },
  amount: { 
    type: Number, 
    required: true 
  },
  type: {
    type: String,
    enum: ['per-paper', 'subscription'],
    default: 'per-paper'
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  payloqaTransactionId: { 
    type: String 
  }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
