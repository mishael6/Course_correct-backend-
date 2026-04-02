const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getSubscription,
  initiateSubscription,
  cancelSubscription
} = require('../controllers/subscriptionController');

// GET  /api/subscription       — get current user's subscription status
router.get('/', auth, getSubscription);

// POST /api/subscription       — initiate a new subscription payment
router.post('/', auth, initiateSubscription);

// POST /api/subscription/cancel — cancel active subscription
router.post('/cancel', auth, cancelSubscription);

module.exports = router;