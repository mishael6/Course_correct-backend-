const axios = require('axios');

const PAYMENT_BASE = 'https://payments.payloqa.com/api/v1/payments';
const SMS_BASE = 'https://sms.payloqa.com/api/v1';

const headers = {
  'X-API-Key': process.env.PAYLOQA_API_KEY,
  'X-Platform-Id': process.env.PAYLOQA_PLATFORM_ID,
  'Content-Type': 'application/json'
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

/**
 * Initiate a mobile money payment (offline/direct flow — no OTP prompt)
 * @param {object} opts
 * @param {number}  opts.amount
 * @param {string}  opts.phone       E.164 format e.g. "233541234567"
 * @param {string}  opts.network     "mtn" | "vodafone" | "airteltigo"
 * @param {string}  opts.orderId     Your internal transaction ID
 * @param {object}  opts.metadata    Any extra key-value pairs
 * @returns {object} { payment_id, message }
 */
exports.initiatePayment = async ({ amount, phone, network, orderId, metadata = {} }) => {
  const webhookUrl = `${process.env.APP_URL}/api/payments/webhook`;

  const res = await axios.post(
    `${PAYMENT_BASE}/create`,
    {
      amount,
      currency: 'GHS',
      payment_method: 'mobile_money',
      phone_number: phone,
      network: network.toLowerCase(),
      offline: true,
      payment_flow: 'direct',
      order_id: orderId,
      webhook_url: webhookUrl,
      metadata
    },
    { headers }
  );

  if (!res.data.success) {
    throw new Error(res.data.message || 'Payloqa payment initiation failed');
  }

  return res.data.data; // { payment_id, message }
};

/**
 * Check the status of a payment
 * @param {string} paymentId  Payloqa payment_id
 * @returns {object} { payment_id, status, amount, currency, message }
 */
exports.getPaymentStatus = async (paymentId) => {
  const res = await axios.get(`${PAYMENT_BASE}/${paymentId}`, { headers });

  if (!res.data.success) {
    throw new Error(res.data.message || 'Failed to fetch payment status');
  }

  return res.data.data;
};

// ─── SMS ──────────────────────────────────────────────────────────────────────

/**
 * Send an SMS notification
 * @param {string} phone    E.164 format e.g. "+233541234567"
 * @param {string} message
 */
exports.sendSMS = async (phone, message) => {
  try {
    const res = await axios.post('https://api.payloqa.com/text/send', {
      to: phone,
      message: message
    }, {
      headers: { 'Authorization': `Bearer ${process.env.PAYLOQA_API_KEY}` }
    });
    return res.data;
  } catch (err) {
    // SMS failures should never crash the main flow — just log
    console.error('SMS send failed:', err.response?.data || err.message);
    return null;
  }
};

// ─── SMS TEMPLATES ────────────────────────────────────────────────────────────

exports.sms = {
  welcome: (name) =>
    `Welcome to CourseCorrect, ${name}! Upload past questions and start earning. Log in at coursecorrect.com`,

  uploadApproved: (title) =>
    `Your document "${title}" has been approved and is now live on the CourseCorrect marketplace. You'll earn 80% on every sale!`,

  uploadRejected: (title) =>
    `Your document "${title}" was not approved. Please review our upload guidelines and resubmit. Log in for details.`,

  paymentInitiated: (amount, title) =>
    `Payment of GHS ${amount} for "${title}" initiated. Please approve the MoMo prompt on your phone.`,

  purchaseSuccess: (title, fileUrl) =>
    `Payment confirmed! Download "${title}" here: ${fileUrl} (Link expires in 1 hour)`,

  saleEarned: (amount, title) =>
    `Ka-ching! You earned GHS ${amount} from a sale of "${title}". Log in to check your wallet.`,

  subscriptionActive: (expiryDate) =>
    `Your CourseCorrect subscription is now active! Unlimited document access until ${expiryDate}. Happy studying!`,

  withdrawalRequested: (amount) =>
    `Withdrawal request of GHS ${amount} received. Admin will process your payout within 24 hours.`,

  withdrawalApproved: (amount) =>
    `Your withdrawal of GHS ${amount} has been approved and sent to your MoMo number. Check your wallet!`,

  withdrawalRejected: (amount) =>
    `Your withdrawal of GHS ${amount} has been rejected. The funds have been returned to your CourseCorrect wallet.`,
};