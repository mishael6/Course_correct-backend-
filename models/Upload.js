const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseCode: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true },
  filePath: { type: String },             // Local disk path (may be missing after redeploy)
  fileName: { type: String },             // Original file name
  fileUrl: { type: String },              // Cloudinary secure URL (permanent)
  cloudinaryPublicId: { type: String },   // Cloudinary public ID (for deletion)
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  downloadCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Upload', uploadSchema);
