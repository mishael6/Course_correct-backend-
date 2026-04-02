const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createPendingTransaction,
  payloqaWebhook,
  getPaymentStatus
} = require('../controllers/paymentController');

// POST /api/payments/create-pending  — create transaction record, return ID for widget
router.post('/create-pending', auth, createPendingTransaction);

// GET  /api/payments/status/:id      — poll payment status
router.get('/status/:payloqaPaymentId', auth, getPaymentStatus);

// POST /api/payments/webhook         — Payloqa webhook (public, no auth)
router.post('/webhook', payloqaWebhook);

module.exports = router;
