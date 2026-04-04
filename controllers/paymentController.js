const Transaction = require('../models/Transaction');
const Upload = require('../models/Upload');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { activateSubscription } = require('./subscriptionController');
const payloqa = require('../services/payloqa');

// Subscription price loaded from settings at runtime
let SUBSCRIPTION_PRICE = 15;
const Settings = require('../models/Settings');
Settings.findOne({ singleton: true }).then(s => {
  if (s?.subscriptionPrice) SUBSCRIPTION_PRICE = s.subscriptionPrice;
}).catch(() => {});

const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return `+${digits}`;
};

// ─── POST /api/payments/create-pending ───────────────────────────────────────
// Creates a pending transaction and returns its ID for the Payloqa widget
exports.createPendingTransaction = async (req, res) => {
  try {
    const { type, uploadId } = req.body;

    let amount = SUBSCRIPTION_PRICE;
    try {
      const Settings = require('../models/Settings');
      const settings = await Settings.findOne({ singleton: true });
      if (settings?.subscriptionPrice) amount = settings.subscriptionPrice;
    } catch (e) {}

    let upload = null;

    if (type === 'per-paper') {
      if (!uploadId) return res.status(400).json({ message: 'uploadId required for per-paper payment' });
      upload = await Upload.findById(uploadId);
      if (!upload) return res.status(404).json({ message: 'Upload not found' });
      if (upload.status !== 'approved') return res.status(400).json({ message: 'Document not available' });
      amount = upload.price;
    }

    const transaction = new Transaction({
      buyer: req.user.id,
      upload: upload?._id || null,
      amount,
      type,
      status: 'pending'
    });

    await transaction.save();

    res.json({
      transactionId: transaction._id,
      amount,
      message: 'Transaction created. Complete payment via widget.'
    });
  } catch (err) {
    console.error('create-pending error:', err.message);
    res.status(500).json({ message: err.message || 'Server Error' });
  }
};

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
// Called by Payloqa widget when payment status changes
exports.payloqaWebhook = async (req, res) => {
  res.status(200).json({ received: true }); // Always ack immediately

  try {
    console.log('Webhook received:', JSON.stringify(req.body));

    // Payloqa widget sends order_id as the transaction ID
    const { order_id, status, metadata } = req.body;

    // Support both order_id and metadata.transaction_id
    const txId = order_id || metadata?.transaction_id;
    if (!txId) return console.error('Webhook: no transaction ID found');

    const transaction = await Transaction.findById(txId).populate('upload');
    if (!transaction) return console.error('Webhook: transaction not found', txId);
    if (transaction.status === 'completed' || transaction.status === 'failed') return;

    if (status === 'completed') {
      transaction.status = 'completed';
      await transaction.save();

      const buyer = await User.findById(transaction.buyer);
      const buyerPhone = buyer?.phone ? toE164(buyer.phone) : null;

      // ── Subscription ──────────────────────────────────────────────────────
      if (transaction.type === 'subscription') {
        const sub = await activateSubscription(
          transaction.buyer,
          transaction.amount,
          txId
        );
        const expiryDate = new Date(sub.expiresAt).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric'
        });
        if (buyerPhone) await payloqa.sendSMS(buyerPhone, payloqa.sms.subscriptionActive(expiryDate));
      }

      // ── Per-paper ─────────────────────────────────────────────────────────
      if (transaction.type === 'per-paper' && transaction.upload) {
        const upload = transaction.upload;

        const uploaderWallet = await Wallet.findOne({ user: upload.uploader });
        if (uploaderWallet) {
          const earnings = Number((transaction.amount * 0.8).toFixed(2));
          uploaderWallet.balance += earnings;
          uploaderWallet.totalEarnings += earnings;
          await uploaderWallet.save();

          const uploader = await User.findById(upload.uploader);
          if (uploader?.phone) {
            await payloqa.sendSMS(toE164(uploader.phone), payloqa.sms.saleEarned(earnings.toFixed(2), upload.title));
          }
        }

        upload.downloadCount += 1;
        await upload.save();

        if (buyerPhone) {
          await payloqa.sendSMS(buyerPhone, payloqa.sms.purchaseSuccess(upload.title, 'https://coursecorrect.netlify.app/dashboard'));
        }
      }

    } else if (status === 'failed' || status === 'cancelled') {
      transaction.status = 'failed';
      await transaction.save();
    }

  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
};

// ─── GET /api/payments/status/:payloqaPaymentId ───────────────────────────────
exports.getPaymentStatus = async (req, res) => {
  try {
    // Look up our transaction by ID
    const transaction = await Transaction.findById(req.params.payloqaPaymentId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ status: transaction.status, amount: transaction.amount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/payments/purchased-uploads ──────────────────────────────────────
exports.getPurchasedUploadIds = async (req, res) => {
  try {
    const transactions = await Transaction.find({ 
      buyer: req.user.id, 
      type: 'per-paper', 
      status: 'completed' 
    }).select('upload');
    const uploadIds = transactions.map(t => t.upload);
    res.json(uploadIds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
