const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');

const MONTHLY_PRICE = 15; // GHS — adjust as needed

// ─── GET: Current user's subscription status ────────────────────────────────
exports.getSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user.id });

    if (!subscription) {
      return res.json({ hasSubscription: false, subscription: null });
    }

    // Auto-expire if past expiresAt
    if (subscription.status === 'active' && subscription.expiresAt < new Date()) {
      subscription.status = 'expired';
      await subscription.save();
    }

    res.json({
      hasSubscription: subscription.status === 'active',
      subscription
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── POST: Initiate a subscription payment via Payloqa ──────────────────────
exports.initiateSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user already has an active subscription
    const existing = await Subscription.findOne({ user: userId });
    if (existing && existing.status === 'active' && existing.expiresAt > new Date()) {
      return res.status(400).json({ 
        message: 'You already have an active subscription',
        expiresAt: existing.expiresAt
      });
    }

    // Create a pending transaction for the subscription
    // In production: call Payloqa API here to push Mobile Money prompt
    const transaction = new Transaction({
      buyer: userId,
      upload: null,          // null means it's a subscription payment, not per-paper
      amount: MONTHLY_PRICE,
      type: 'subscription',  // We'll update the Transaction model to support this
      payloqaTransactionId: 'MOCK_SUB_TX_' + Date.now()
    });

    await transaction.save();

    res.json({
      message: 'Subscription payment initiated. Complete payment via Mobile Money.',
      transactionId: transaction._id,
      amount: MONTHLY_PRICE,
      currency: 'GHS'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── POST: Cancel subscription ───────────────────────────────────────────────
exports.cancelSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user.id });

    if (!subscription || subscription.status !== 'active') {
      return res.status(400).json({ message: 'No active subscription to cancel' });
    }

    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    await subscription.save();

    res.json({ 
      message: 'Subscription cancelled. You retain access until the expiry date.',
      expiresAt: subscription.expiresAt
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── INTERNAL: Activate subscription after confirmed payment ─────────────────
// Called from the Payloqa webhook handler in paymentController.js
exports.activateSubscription = async (userId, amount, payloqaTransactionId) => {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

  // Upsert: create or renew the subscription
  const subscription = await Subscription.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      status: 'active',
      plan: 'monthly',
      amount,
      startDate: now,
      expiresAt,
      payloqaTransactionId
    },
    { upsert: true, new: true }
  );

  return subscription;
};

// ─── INTERNAL: Check if a user can access a document ─────────────────────────
// Returns { canAccess: true/false, reason: string }
exports.checkAccess = async (userId, uploadId) => {
  // 1. Check active subscription
  const subscription = await Subscription.findOne({ user: userId });
  if (subscription && subscription.status === 'active' && subscription.expiresAt > new Date()) {
    return { canAccess: true, reason: 'subscription' };
  }

  // 2. Check if user has a completed per-paper transaction for this upload
  const transaction = await Transaction.findOne({
    buyer: userId,
    upload: uploadId,
    status: 'completed'
  });

  if (transaction) {
    return { canAccess: true, reason: 'per-paper' };
  }

  return { canAccess: false, reason: 'no_access' };
};