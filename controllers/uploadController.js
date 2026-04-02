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

    const newUpload = new Upload({
      title,
      courseCode,
      institution,
      year: Number(year),
      price: Number(price),
      filePath,
      fileName,
      uploader: req.user.id
    });

    await newUpload.save();

    res.status(201).json({
      message: 'Upload submitted for admin approval',
      upload: {
        id: newUpload._id,
        title: newUpload.title,
        courseCode: newUpload.courseCode,
        status: newUpload.status
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

    const { canAccess, reason } = await checkAccess(req.user.id, req.params.id);

    if (!canAccess) {
      return res.status(403).json({
        message: 'Access denied. Subscribe or purchase this document to download.',
        options: ['subscribe', 'buy']
      });
    }

    // If using local file storage
    if (upload.filePath) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        fileUrl: `${baseUrl}${upload.filePath}`,
        title: upload.title,
        accessType: reason,
        expiresIn: '1 hour'
      });
    } 
    // Fallback for old Cloudinary records
    else if (upload.cloudinaryPublicId) {
      const publicUrl = cloudinary.url(upload.cloudinaryPublicId, {
        resource_type: 'raw',
        type: 'upload',
        secure: true
      });
      res.json({
        fileUrl: publicUrl,
        title: upload.title,
        accessType: reason,
        expiresIn: '1 hour'
      });
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