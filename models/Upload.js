const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseCode: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true },
  filePath: { type: String, required: true },      // Local file path: /uploads/filename.pdf
  fileName: { type: String, required: true },      // Original file name
  fileUrl: { type: String },                        // Deprecated - for backward compatibility
  cloudinaryPublicId: { type: String },             // Deprecated - for backward compatibility
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
