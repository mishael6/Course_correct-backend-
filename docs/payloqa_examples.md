# Payloqa Integration Examples

Payloqa offers SMS and Mobile Money capabilities which are integrated into the backend.

## 1. Initializing Mobile Money Payment

When a student clicks "Buy", the frontend requests to initiate a payment:

```javascript
// frontend/api.js (Conceptual)
const response = await axios.post('/api/payments/initiate', { uploadId: '...' });
```

This triggers the Payloqa Push API for Mobile Money on the backend (mocked in `paymentController.js`).

## 2. Webhook Verification

Payloqa sends a POST request to `/api/payments/webhook` when a user enters their Mobile Money PIN and approves the transaction.
The logic checks `status === 'success'`, then automatically distributes an 80% commission to the document uploader's wallet and releases the file correctly.

## 3. SMS Notifications

In multiple controllers, Payloqa SMS should be triggered. For instance, when a document is approved:

```javascript
// Example implementation function for Payloqa SMS
const sendPayloqaSMS = async (phone, message) => {
  await axios.post('https://api.payloqa.com/text/send', {
    to: phone,
    message: message
  }, {
    headers: { 'Authorization': `Bearer ${process.env.PAYLOQA_API_KEY}` }
  });
};
```
These hooks exist as `// TODO: Send exact Payloqa SMS` inside the controllers (e.g. `authController.js`, `adminController.js`, `paymentController.js`).
