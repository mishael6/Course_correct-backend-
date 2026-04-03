const Upload = require('../models/Upload');
const cloudinary = require('../config/cloudinary');
const { checkAccess } = require('./subscriptionController');
const streamifier = require('streamifier');
const path = require('path');
const fs = require('fs');

// ─── Helper: upload buffer to Cloudinary ─────────────────────────────────────
const uploadToCloudinary = (buffer, folder, publicId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        type: 'upload',
        access_mode: 'public',
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

// ─── Helper: get the best available download URL ──────────────────────────────
// Priority: local disk → Cloudinary URL → generate from public ID
const resolveFileUrl = (upload, req) => {
  // 1. Try local disk first (fastest)
  if (upload.filePath) {
    const uploadsDir = path.join(__dirname, '../uploads');
    const fullPath = path.join(uploadsDir, path.basename(upload.filePath));
    if (fs.existsSync(fullPath)) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const filename = path.basename(upload.filePath);
      return `${baseUrl}/uploads/${encodeURIComponent(filename)}`;
    }
    console.warn(`Local file missing for "${upload.title}" — falling back to Cloudinary`);
  }

  // 2. Use stored Cloudinary secure_url (permanent)
  if (upload.fileUrl) {
    return upload.fileUrl;
  }

  // 3. Generate URL from cloudinaryPublicId
  if (upload.cloudinaryPublicId) {
    return cloudinary.url(upload.cloudinaryPublicId, {
      resource_type: 'raw',
      type: 'upload',
      secure: true,
      format: 'pdf'
    });
  }

  return null;
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

    const filePath = `/uploads/${req.file.filename}`;
    const fileName = req.file.originalname;

    // Upload to Cloudinary as permanent backup
    let cloudinaryPublicId = null;
    let fileUrl = null;

    try {
      let fileBuffer = req.file.buffer;
      if (!fileBuffer) {
        const fullPath = path.join(__dirname, '../uploads', req.file.filename);
        fileBuffer = fs.readFileSync(fullPath);
      }

      const publicId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const result = await uploadToCloudinary(fileBuffer, 'course_correct', publicId);
      cloudinaryPublicId = result.public_id;
      fileUrl = result.secure_url; // Store the permanent URL
      console.log(`✓ Backed up to Cloudinary: ${cloudinaryPublicId}`);
    } catch (cloudErr) {
      console.warn(`⚠ Cloudinary backup failed: ${cloudErr.message}`);
    }

    const newUpload = new Upload({
      title,
      courseCode,
      institution,
      year: Number(year),
      price: Number(price),
      filePath,
      fileName,
      fileUrl,             // Permanent Cloudinary URL
      cloudinaryPublicId,  // For deletion and URL generation
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
      .select('-filePath -fileUrl -cloudinaryPublicId');

    res.json(uploads);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/uploads/mine ────────────────────────────────────────────────────
exports.getMyUploads = async (req, res) => {
  try {
    const uploads = await Upload.find({ uploader: req.user.id })
      .select('-filePath -fileUrl -cloudinaryPublicId')
      .sort({ createdAt: -1 });
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
      .select('-filePath -fileUrl -cloudinaryPublicId');

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

    // Access check — admins bypass
    if (req.user.role !== 'admin') {
      const { canAccess } = await checkAccess(req.user.id, req.params.id);
      if (!canAccess) {
        return res.status(403).json({
          message: 'Access denied. Subscribe or purchase this document to download.',
          options: ['subscribe', 'buy']
        });
      }
    }

    // 1. Try serving from local disk (fastest, works on localhost)
    if (upload.filePath) {
      const uploadsDir = path.join(__dirname, '../uploads');
      const fullPath = path.join(uploadsDir, path.basename(upload.filePath));
      if (fs.existsSync(fullPath)) {
        const safeTitle = upload.title.replace(/[^a-z0-9]/gi, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
        return fs.createReadStream(fullPath).pipe(res);
      }
      console.warn(`Local file missing for "${upload.title}" — streaming from Cloudinary`);
    }

    // 2. Stream from Cloudinary through backend (bypasses Cloudinary auth)
    if (upload.cloudinaryPublicId || upload.fileUrl) {
      const axios = require('axios');

      // Generate a signed URL valid for 1 hour
      const signedUrl = cloudinary.url(upload.cloudinaryPublicId || '', {
        resource_type: 'raw',
        type: 'upload',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        format: 'pdf'
      });

      // Use stored fileUrl as fallback if public_id signing fails
      const fetchUrl = upload.cloudinaryPublicId ? signedUrl : upload.fileUrl;

      const cloudResponse = await axios.get(fetchUrl, { responseType: 'stream' });
      const safeTitle = upload.title.replace(/[^a-z0-9]/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
      return cloudResponse.data.pipe(res);
    }

    return res.status(404).json({ message: 'File not found. Please contact admin.' });
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/uploads/:id/preview ────────────────────────────────────────────
// Admin-only: stream file for preview before approval
exports.previewUpload = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ message: 'Upload not found' });

    const axios = require('axios');
    const safeTitle = upload.title.replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);

    // 1. Serve from local disk if available
    if (upload.filePath) {
      const uploadsDir = path.join(__dirname, '../uploads');
      const fullPath = path.join(uploadsDir, path.basename(upload.filePath));
      if (fs.existsSync(fullPath)) {
        return fs.createReadStream(fullPath).pipe(res);
      }
    }

    // 2. Stream from Cloudinary via signed URL
    if (upload.cloudinaryPublicId) {
      const signedUrl = cloudinary.url(upload.cloudinaryPublicId, {
        resource_type: 'raw',
        type: 'upload',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        format: 'pdf'
      });
      const cloudResponse = await axios.get(signedUrl, { responseType: 'stream' });
      return cloudResponse.data.pipe(res);
    }

    // 3. Stream from stored fileUrl
    if (upload.fileUrl) {
      const cloudResponse = await axios.get(upload.fileUrl, { responseType: 'stream' });
      return cloudResponse.data.pipe(res);
    }

    res.status(404).json({ message: 'File not available for preview' });
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

    // Delete from Cloudinary
    if (upload.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(upload.cloudinaryPublicId, { resource_type: 'raw' });
    }

    // Delete local file
    if (upload.filePath) {
      const fullPath = path.join(__dirname, '../uploads', path.basename(upload.filePath));
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }

    await upload.deleteOne();
    res.json({ message: 'Upload deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};