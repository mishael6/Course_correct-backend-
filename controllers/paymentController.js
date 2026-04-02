const Transaction = require('../models/Transaction');
const Upload = require('../models/Upload');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { activateSubscription } = require('./subscriptionController');
const payloqa = require('../services/payloqa');

// ─── Helper: normalise phone to E.164 (Ghana) ────────────────────────────────
const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return `+${digits}`;
};

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
exports.initiatePayment = async (req, res) => {
  try {
    const { uploadId, network } = req.body;

    if (!network) {
      return res.status(400).json({ message: 'Please provide your MoMo network (mtn, vodafone, airteltigo)' });
    }

    const upload = await Upload.findById(uploadId);
    if (!upload) return res.status(404).json({ message: 'Upload not found' });
    if (upload.status !== 'approved') return res.status(400).json({ message: 'Document is not available for purchase' });

    const buyer = await User.findById(req.user.id);
    const phone = toE164(buyer.phone);

    const transaction = new Transaction({
      buyer: req.user.id,
      upload: uploadId,
      amount: upload.price,
      type: 'per-paper',
      status: 'pending'
    });
    await transaction.save();

    const payloqaRes = await payloqa.initiatePayment({
      amount: upload.price,
      phone,
      network,
      orderId: transaction._id.toString(),
      metadata: {
        transaction_id: transaction._id.toString(),
        upload_title: upload.title,
        buyer_name: buyer.name,
        type: 'per-paper'
      }
    });

    transaction.payloqaTransactionId = payloqaRes.payment_id;
    await transaction.save();

    await payloqa.sendSMS(phone, payloqa.sms.paymentInitiated(upload.price.toFixed(2), upload.title));

    res.json({
      message: 'Payment initiated. Approve the MoMo prompt on your phone.',
      transactionId: transaction._id,
      payloqaPaymentId: payloqaRes.payment_id
    });
  } catch (err) {
    console.error('Payment initiation error:', err.message);
    res.status(500).json({ message: err.message || 'Server Error' });
  }
};

// ─── POST /api/payments/subscription ─────────────────────────────────────────
exports.initiateSubscriptionPayment = async (req, res) => {
  try {
    const { network } = req.body;
    const SUBSCRIPTION_PRICE = 15;

    if (!network) {
      return res.status(400).json({ message: 'Please provide your MoMo network (mtn, vodafone, airteltigo)' });
    }

    const buyer = await User.findById(req.user.id);
    const phone = toE164(buyer.phone);

    const transaction = new Transaction({
      buyer: req.user.id,
      upload: null,
      amount: SUBSCRIPTION_PRICE,
      type: 'subscription',
      status: 'pending'
    });
    await transaction.save();

    const payloqaRes = await payloqa.initiatePayment({
      amount: SUBSCRIPTION_PRICE,
      phone,
      network,
      orderId: transaction._id.toString(),
      metadata: {
        transaction_id: transaction._id.toString(),
        buyer_name: buyer.name,
        type: 'subscription'
      }
    });

    transaction.payloqaTransactionId = payloqaRes.payment_id;
    await transaction.save();

    res.json({
      message: 'Subscription payment initiated. Approve the MoMo prompt on your phone.',
      transactionId: transaction._id,
      payloqaPaymentId: payloqaRes.payment_id,
      amount: SUBSCRIPTION_PRICE
    });
  } catch (err) {
    console.error('Subscription payment error:', err.message);
    res.status(500).json({ message: err.message || 'Server Error' });
  }
};

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
exports.payloqaWebhook = async (req, res) => {
  res.status(200).json({ received: true }); // Always ack immediately

  try {
    const { order_id, status } = req.body;

    const transaction = await Transaction.findById(order_id).populate('upload');
    if (!transaction) return console.error('Webhook: transaction not found', order_id);
    if (transaction.status === 'completed' || transaction.status === 'failed') return;

    if (status === 'completed') {
      transaction.status = 'completed';
      await transaction.save();

      const buyer = await User.findById(transaction.buyer);
      const buyerPhone = buyer ? toE164(buyer.phone) : null;

      if (transaction.type === 'subscription') {
        const sub = await activateSubscription(transaction.buyer, transaction.amount, transaction.payloqaTransactionId);
        const expiryDate = new Date(sub.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        if (buyerPhone) await payloqa.sendSMS(buyerPhone, payloqa.sms.subscriptionActive(expiryDate));
      }

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
          await payloqa.sendSMS(buyerPhone, payloqa.sms.purchaseSuccess(upload.title, 'https://coursecorrect.com/dashboard'));
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
    const status = await payloqa.getPaymentStatus(req.params.payloqaPaymentId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
