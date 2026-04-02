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
  downloadUpload
} = require('../controllers/adminController');

router.use(auth, adminAuth);

router.get('/stats', getStats);
router.get('/uploads/pending', getPendingUploads);
router.get('/uploads/:id/download', downloadUpload);
router.put('/uploads/:id/status', updateUploadStatus);
router.get('/withdrawals/pending', getPendingWithdrawals);
router.put('/withdrawals/:id/approve', approveWithdrawal);

module.exports = router;
