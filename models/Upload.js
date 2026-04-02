const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseCode: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true },
  fileUrl: { type: String, required: true },           // Cloudinary secure URL
  cloudinaryPublicId: { type: String, required: true }, // For signed URLs & deletion
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
