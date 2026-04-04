const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseCode: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true },
  filePath: { type: String },              // Local disk path (may be missing after redeploy)
  fileName: { type: String },              // Original file name
  fileUrl: { type: String },               // Public URL (Supabase or Cloudinary)
  supabasePath: { type: String },          // Supabase storage path for SDK operations
  cloudinaryPublicId: { type: String },    // Legacy — kept for old uploads
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
