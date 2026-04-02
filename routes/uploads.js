const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const upload = require('../config/multer');
const {
  uploadFile,
  getMarketplaceUploads,
  getMyUploads,
  getUploadById,
  downloadUpload,
  previewUpload,
  deleteUpload
} = require('../controllers/uploadController');

// IMPORTANT: specific routes before parameterized ones (:id catches everything)

// Public
router.get('/', getMarketplaceUploads);

// Authenticated — specific paths first
router.get('/mine', auth, getMyUploads);
router.post('/', auth, upload.single('document'), uploadFile);

// Parameterized routes
router.get('/:id', getUploadById);
router.get('/:id/download', auth, downloadUpload);
router.get('/:id/preview', auth, adminAuth, previewUpload);
router.delete('/:id', auth, deleteUpload);

module.exports = router;