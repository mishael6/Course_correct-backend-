# Course Correct API Documentation

## Auth
- `POST /api/auth/register` - Register a user (Requires name, email, phone, password).
- `POST /api/auth/login` - Login to receive standard JWT token.
- `GET /api/auth/me` - Get current user profile (Auth required).

## Uploads
- `POST /api/uploads/` - Submit a new document upload. Requires `multipart/form-data` with fields `title`, `courseCode`, `institution`, `year`, `price`, `document`.
- `GET /api/uploads/` - Get all approved marketplace uploads. Supports query params: `search`, `courseCode`, `institution`, `year`.
- `GET /api/uploads/:id` - Get specific upload details.

## Wallet & Earnings
- `GET /api/wallet/` - Get current user's wallet balance and earnings.
- `POST /api/wallet/withdraw` - Request a withdrawal. Requires `amount`.

## Payments (Payloqa Integration)
- `POST /api/payments/initiate` - Initiate a purchase for a document. Requires `uploadId`.
- `POST /api/payments/webhook` - Payloqa webhook endpoint to confirm transaction success.

## Admin
- `GET /api/admin/uploads/pending` - View uploads awaiting approval.
- `PUT /api/admin/uploads/:id/status` - Approve/reject an upload. Requires `status` ('approved' or 'rejected').
- `GET /api/admin/withdrawals/pending` - View pending withdrawal requests.
- `PUT /api/admin/withdrawals/:id/approve` - Approve a withdrawal and process mock payout.
