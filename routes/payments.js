const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createPendingTransaction,
  payloqaWebhook,
  getPaymentStatus,
  getPurchasedUploadIds
} = require('../controllers/paymentController');

// POST /api/payments/create-pending  — create transaction record, return ID for widget
router.post('/create-pending', auth, createPendingTransaction);

// GET  /api/payments/status/:id      — poll payment status
router.get('/status/:payloqaPaymentId', auth, getPaymentStatus);

// GET  /api/payments/purchased-uploads — fetch purchased items
router.get('/purchased-uploads', auth, getPurchasedUploadIds);

// POST /api/payments/webhook         — Payloqa webhook (public, no auth)
router.post('/webhook', payloqaWebhook);

module.exports = router;
