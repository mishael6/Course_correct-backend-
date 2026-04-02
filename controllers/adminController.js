const Upload = require('../models/Upload');
const Withdrawal = require('../models/Withdrawal');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const payloqa = require('../services/payloqa');
const cloudinary = require('../config/cloudinary');
const path = require('path');

const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return `+${digits}`;
};

exports.getStats = async (req, res) => {
  try {
    const [totalUploads, pendingUploads, approvedUploads, rejectedUploads, pendingWithdrawals] = await Promise.all([
      Upload.countDocuments(),
      Upload.countDocuments({ status: 'pending' }),
      Upload.countDocuments({ status: 'approved' }),
      Upload.countDocuments({ status: 'rejected' }),
      Withdrawal.countDocuments({ status: 'pending' }),
    ]);
    res.json({ totalUploads, pendingUploads, approvedUploads, rejectedUploads, pendingWithdrawals });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

exports.getPendingUploads = async (req, res) => {
  try {
    // Include fileUrl so admin can preview the document
    const uploads = await Upload.find({ status: 'pending' }).populate('uploader', 'name email phone');
    
    // Add backup status to each upload
    const uploadsWithBackupStatus = uploads.map(upload => ({
      ...upload.toObject(),
      backupStatus: {
        hasLocalFile: !!upload.filePath,
        hasCloudinaryBackup: !!upload.cloudinaryPublicId,
        isSafe: !!upload.cloudinaryPublicId // Safe if it has Cloudinary backup
      }
    }));
    
    res.json(uploadsWithBackupStatus);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

exports.updateUploadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const upload = await Upload.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('uploader', 'name phone');

    if (!upload) return res.status(404).json({ message: 'Upload not found' });

    // SMS uploader
    if (upload.uploader?.phone) {
      const phone = toE164(upload.uploader.phone);
      const message = status === 'approved'
        ? payloqa.sms.uploadApproved(upload.title)
        : payloqa.sms.uploadRejected(upload.title);
      await payloqa.sendSMS(phone, message);
    }

    res.json(upload);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

exports.getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' }).populate('user', 'name email phone');
    res.json(withdrawals);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('user', 'name phone');
    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid withdrawal record' });
    }

    withdrawal.status = 'approved';
    await withdrawal.save();

    // SMS user about payout
    if (withdrawal.user?.phone) {
      await payloqa.sendSMS(
        toE164(withdrawal.user.phone),
        payloqa.sms.withdrawalApproved(withdrawal.amount.toFixed(2))
      );
    }

    res.json({ message: 'Withdrawal approved', withdrawal });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── Admin Download Upload (for review) ────────────────────────────────────────
exports.downloadUpload = async (req, res) => {
  try {
    const upload = await Upload.findById(req.params.id);

    if (!upload) {
      return res.status(404).json({ message: 'Upload not found' });
    }

    // If using local file storage
    if (upload.filePath) {
      const path = require('path');
      const fs = require('fs');
      
      // Check if file actually exists on disk
      const uploadsDir = path.join(__dirname, '../uploads');
      const fullPath = path.join(uploadsDir, path.basename(upload.filePath));
      
      if (fs.existsSync(fullPath)) {
        // File exists - return URL with proper encoding
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const filename = path.basename(upload.filePath);
        const encodedPath = `/uploads/${encodeURIComponent(filename)}`;
        
        res.json({
          fileUrl: `${baseUrl}${encodedPath}`,
          title: upload.title,
          expiresIn: 'permanent'
        });
      } else if (upload.cloudinaryPublicId) {
        // Local file missing - fallback to Cloudinary if available
        const cloudinary = require('../config/cloudinary');
        console.warn(`Local file missing for upload ${upload._id}, using Cloudinary fallback`);
        const publicUrl = cloudinary.url(upload.cloudinaryPublicId, {
          resource_type: 'raw',
          type: 'upload',
          secure: true,
          format: 'pdf'
        });
        res.json({
          fileUrl: publicUrl,
          title: upload.title,
          expiresIn: '1 hour'
        });
      } else {
        return res.status(404).json({ 
          message: 'File not found on server. Please contact admin.' 
        });
      }
    }
    // Fallback for old Cloudinary records
    else if (upload.cloudinaryPublicId) {
      const cloudinary = require('../config/cloudinary');
      const publicUrl = cloudinary.url(upload.cloudinaryPublicId, {
        resource_type: 'raw',
        type: 'upload',
        secure: true,
        format: 'pdf'
      });
      res.json({
        fileUrl: publicUrl,
        title: upload.title,
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
