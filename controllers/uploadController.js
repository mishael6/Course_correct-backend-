const Upload = require('../models/Upload');
const supabase = require('../config/supabase');
const { checkAccess } = require('./subscriptionController');
const path = require('path');
const fs = require('fs');

const BUCKET = 'documents';

// ─── Helper: upload buffer to Supabase Storage ────────────────────────────────
const uploadToSupabase = async (buffer, filename) => {
  const filePath = `uploads/${Date.now()}_${filename.replace(/\s+/g, '_')}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  // Get permanent public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return {
    path: filePath,
    publicUrl: urlData.publicUrl
  };
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

    // Get file buffer
    let fileBuffer = req.file.buffer;
    if (!fileBuffer) {
      const fullPath = path.join(__dirname, '../uploads', req.file.filename);
      fileBuffer = fs.readFileSync(fullPath);
    }

    // Upload to Supabase
    let fileUrl = null;
    let supabasePath = null;

    try {
      const result = await uploadToSupabase(fileBuffer, req.file.originalname);
      fileUrl = result.publicUrl;
      supabasePath = result.path;
      console.log(`✓ Uploaded to Supabase: ${supabasePath}`);
      console.log(`✓ Public URL: ${fileUrl}`);
    } catch (uploadErr) {
      console.error(`Supabase upload failed: ${uploadErr.message}`);
      return res.status(500).json({ message: 'File upload failed. Please try again.' });
    }

    // Also save local path if using disk storage
    const filePath = req.file.filename ? `/uploads/${req.file.filename}` : null;

    const newUpload = new Upload({
      title,
      courseCode,
      institution,
      year: Number(year),
      price: Number(price),
      filePath,
      fileName: req.file.originalname,
      fileUrl,           // Permanent Supabase public URL
      supabasePath,      // For deletion
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
      .select('-filePath -fileUrl -supabasePath -cloudinaryPublicId');

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
      .select('-filePath -fileUrl -supabasePath -cloudinaryPublicId')
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
      .select('-filePath -fileUrl -supabasePath -cloudinaryPublicId');

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

    const safeTitle = (upload.title || 'document').replace(/[^a-z0-9]/gi, '_');

    // 1. Try local disk (fast, works on localhost)
    if (upload.filePath) {
      const fullPath = path.join(__dirname, '../uploads', path.basename(upload.filePath));
      if (fs.existsSync(fullPath)) {
        console.log(`Serving from disk: ${fullPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
        return fs.createReadStream(fullPath).pipe(res);
      }
    }

    // 2. Stream from Supabase (permanent, always works)
    if (upload.supabasePath || upload.fileUrl) {
      console.log(`Streaming from Supabase: ${upload.supabasePath}`);
      try {
        // Download via Supabase SDK — authenticated, always works
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .download(upload.supabasePath);

        if (error) throw new Error(error.message);

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      } catch (supaErr) {
        console.error(`Supabase download failed: ${supaErr.message}`);
        // Last resort — redirect to public URL
        if (upload.fileUrl) {
          return res.redirect(upload.fileUrl);
        }
      }
    }

    return res.status(404).json({ message: 'File not found. Please contact admin.' });
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ message: 'Server error during download' });
  }
};

// ─── GET /api/uploads/:id/preview ────────────────────────────────────────────
exports.previewUpload = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) return res.status(404).json({ message: 'Upload not found' });

    const safeTitle = (upload.title || 'document').replace(/[^a-z0-9]/gi, '_');

    // 1. Local disk
    if (upload.filePath) {
      const fullPath = path.join(__dirname, '../uploads', path.basename(upload.filePath));
      if (fs.existsSync(fullPath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
        return fs.createReadStream(fullPath).pipe(res);
      }
    }

    // 2. Supabase SDK download
    if (upload.supabasePath) {
      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .download(upload.supabasePath);

        if (error) throw new Error(error.message);

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      } catch (supaErr) {
        console.error(`Supabase preview failed: ${supaErr.message}`);
      }
    }

    // 3. Redirect to public URL
    if (upload.fileUrl) {
      return res.redirect(upload.fileUrl);
    }

    res.status(404).json({ message: 'File not available for preview.' });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ message: 'Server error during preview' });
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

    // Delete from Supabase
    if (upload.supabasePath) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([upload.supabasePath]);
      if (error) console.warn(`Supabase delete failed: ${error.message}`);
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