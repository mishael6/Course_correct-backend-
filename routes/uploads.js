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

// iframes and window.open can't send Authorization headers
// so support ?token= query param for download and preview
const authOrToken = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return auth(req, res, next);
};

// IMPORTANT: specific routes before parameterized ones (:id catches everything)

// Public
router.get('/', getMarketplaceUploads);

// Authenticated — specific paths first
router.get('/mine', auth, getMyUploads);
router.post('/', auth, function (req, res, next) {
  upload.single('document')(req, res, function (err) {
    if (err) {
      console.error('Multer upload error:', err);
      if (err.message === 'Only PDF files are allowed') {
        return res.status(400).json({ message: err.message });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File is too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    next();
  });
}, uploadFile);

// Parameterized routes
router.get('/:id', getUploadById);
router.get('/:id/download', authOrToken, downloadUpload);
router.get('/:id/preview', authOrToken, adminAuth, previewUpload);
router.delete('/:id', auth, deleteUpload);

module.exports = router;