const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../config/multer');
const {
  uploadFile,
  getMarketplaceUploads,
  getUploadById,
  downloadUpload,
  deleteUpload
} = require('../controllers/uploadController');

// POST /api/uploads             — upload PDF (auth required, PDF only, 10MB max)
router.post('/', auth, upload.single('document'), uploadFile);

// GET  /api/uploads             — browse marketplace (public)
router.get('/', getMarketplaceUploads);

// GET  /api/uploads/:id         — get document metadata (public, no fileUrl)
router.get('/:id', getUploadById);

// GET  /api/uploads/:id/download — get signed Cloudinary URL (auth + access check)
router.get('/:id/download', auth, downloadUpload);

// DELETE /api/uploads/:id       — delete own pending/rejected upload
router.delete('/:id', auth, deleteUpload);

module.exports = router;
