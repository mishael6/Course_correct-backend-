const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const {
  getStats,
  getPendingUploads,
  updateUploadStatus,
  getPendingWithdrawals,
  approveWithdrawal,
  getAllUsers,
  getAllUploads,
} = require('../controllers/adminController');
const {
  getAdminSettings,
  updateSettings
} = require('../controllers/settingsController');

router.use(auth, adminAuth);

// Stats
router.get('/stats', getStats);

// Settings
router.get('/settings', getAdminSettings);
router.put('/settings', updateSettings);

// Uploads
router.get('/uploads/pending', getPendingUploads);
router.get('/uploads', getAllUploads);
router.put('/uploads/:id/status', updateUploadStatus);

// Withdrawals
router.get('/withdrawals/pending', getPendingWithdrawals);
router.put('/withdrawals/:id/approve', approveWithdrawal);

// Users
router.get('/users', getAllUsers);

module.exports = router;
