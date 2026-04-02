const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  initiatePayment,
  initiateSubscriptionPayment,
  payloqaWebhook,
  getPaymentStatus
} = require('../controllers/paymentController');

// POST /api/payments/initiate         — pay for a single document
router.post('/initiate', auth, initiatePayment);

// POST /api/payments/subscription     — pay for monthly subscription
router.post('/subscription', auth, initiateSubscriptionPayment);

// GET  /api/payments/status/:id       — poll payment status
router.get('/status/:payloqaPaymentId', auth, getPaymentStatus);

// POST /api/payments/webhook          — Payloqa webhook (public, no auth)
router.post('/webhook', payloqaWebhook);

module.exports = router;
