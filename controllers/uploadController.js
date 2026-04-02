const Upload = require('../models/Upload');
const cloudinary = require('../config/cloudinary');
const { checkAccess } = require('./subscriptionController');
const streamifier = require('streamifier');
const path = require('path');
const fs = require('fs');

// ─── Helper: upload buffer to Cloudinary (kept for backward compat) ─────────────────────────────────────
const uploadToCloudinary = (buffer, folder, publicId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        type: 'upload',         // 'upload' = publicly accessible URL
        access_mode: 'public',  // explicitly allow public delivery
        format: 'pdf'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// ─── POST /api/uploads ────────────────────────────────────────────────────────
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please attach a PDF file' });
    }

    const { title, courseCode, institution, year, price } = req.body;

    if (!title || !courseCode || !institution || !year || !price) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // File is already saved to disk by multer
    const filePath = `/uploads/${req.file.filename}`;
    const fileName = req.file.originalname;

    // Backup to Cloudinary for data loss prevention
    let cloudinaryPublicId = null;
    try {
      // Get file buffer (either from memory or read from disk)
      let fileBuffer = req.file.buffer;
      
      if (!fileBuffer) {
        // If using disk storage, req.file.buffer is undefined, so read from disk
        const fullPath = path.join(__dirname, '../uploads', req.file.filename);
        fileBuffer = fs.readFileSync(fullPath);
      }

      // Generate unique public ID - don't include folder in ID, it goes in options
      const publicId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const result = await uploadToCloudinary(fileBuffer, 'course_correct', publicId);
      cloudinaryPublicId = result.public_id;
      console.log(`✓ File backed up to Cloudinary: ${cloudinaryPublicId}`);
    } catch (cloudErr) {
      console.warn(`⚠ Cloudinary backup failed: ${cloudErr.message} - continuing with local storage`);
      // Don't fail the upload, local storage is still valid
    }

    const newUpload = new Upload({
      title,
      courseCode,
      institution,
      year: Number(year),
      price: Number(price),
      filePath,
      fileName,
      cloudinaryPublicId, // Store backup ID
      uploader: req.user.id
    });

    await newUpload.save();

    res.status(201).json({
      message: 'Upload submitted for admin approval',
      upload: {
        id: newUpload._id,
        title: newUpload.title,
        courseCode: newUpload.courseCode,
        status: newUpload.status,
        hasBackup: !!cloudinaryPublicId
      }
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    if (err.message === 'Only PDF files are allowed') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/uploads ─────────────────────────────────────────────────────────
exports.getMarketplaceUploads = async (req, res) => {
  try {
    const { search, courseCode, institution, year } = req.query;
    let query = { status: 'approved' };

    if (search) query.title = { $regex: search, $options: 'i' };
    if (courseCode) query.courseCode = { $regex: courseCode, $options: 'i' };
    if (institution) query.institution = { $regex: institution, $options: 'i' };
    if (year) query.year = Number(year);

    const uploads = await Upload.find(query)
      .populate('uploader', 'name')
      .select('-fileUrl -cloudinaryPublicId');

    res.json(uploads);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/uploads/:id ─────────────────────────────────────────────────────
exports.getUploadById = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id)
      .populate('uploader', 'name')
      .select('-fileUrl -cloudinaryPublicId');

    if (!upload) return res.status(404).json({ message: 'Upload not found' });
    res.json(upload);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/uploads/:id/download ───────────────────────────────────────────
exports.downloadUpload = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);

    if (!upload || upload.status !== 'approved') {
      return res.status(404).json({ message: 'Document not found' });
    }

    let accessReason = 'none';

    // Admins get free access to all approved documents
    if (req.user.role === 'admin') {
      accessReason = 'admin';
    } else {
      // Regular users need subscription or per-paper purchase
      const { canAccess, reason } = await checkAccess(req.user.id, req.params.id);

      if (!canAccess) {
        return res.status(403).json({
          message: 'Access denied. Subscribe or purchase this document to download.',
          options: ['subscribe', 'buy']
        });
      }

      accessReason = reason;
    }

    // Serve from local file storage (primary)
    if (upload.filePath) {
      const uploadsDir = path.join(__dirname, '../uploads');
      const fullPath = path.join(uploadsDir, path.basename(upload.filePath));
      
      if (fs.existsSync(fullPath)) {
        // File exists - return direct URL for download
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const filename = path.basename(upload.filePath);
        const encodedPath = `/uploads/${encodeURIComponent(filename)}`;
        
        return res.json({
          fileUrl: `${baseUrl}${encodedPath}`,
          title: upload.title,
          accessType: accessReason,
          expiresIn: 'permanent'
        });
      } else {
        // Local file missing
        console.warn(`Local file missing for upload ${upload._id}`);
        if (upload.cloudinaryPublicId) {
          // Suggest admin can recover from backup
          return res.status(404).json({
            message: 'File temporarily unavailable. Has Cloudinary backup. Please contact admin to recover.',
            hasBackup: true,
            uploadId: upload._id,
            cloudinaryId: upload.cloudinaryPublicId
          });
        } else {
          return res.status(404).json({ 
            message: 'File not found. Please contact admin.' 
          });
        }
      }
    } else {
      return res.status(404).json({ message: 'File not found' });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── DELETE /api/uploads/:id ──────────────────────────────────────────────────
exports.deleteUpload = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);

    if (!upload) return res.status(404).json({ message: 'Upload not found' });

    if (upload.uploader.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (upload.status === 'approved') {
      return res.status(400).json({ message: 'Cannot delete an approved document' });
    }

    if (upload.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(upload.cloudinaryPublicId, {
        resource_type: 'raw'
      });
    }

    await upload.deleteOne();
    res.json({ message: 'Upload deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};