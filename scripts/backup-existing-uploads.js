/**
 * Migration script to back up existing approved uploads to Cloudinary
 * Ensures no data loss for files that may have been uploaded before backup feature
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

dotenv.config();

const Upload = require('../models/Upload');

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

async function backupExistingFiles() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/course_correct');
    console.log('Connected to MongoDB\n');

    // Find all approved uploads without Cloudinary backup
    const uploads = await Upload.find({
      status: 'approved',
      cloudinaryPublicId: { $exists: false }
    });

    console.log(`Found ${uploads.length} approved files without Cloudinary backup\n`);

    const uploadsDir = path.join(__dirname, '../uploads');
    let backedUp = 0;
    let skipped = 0;

    for (const upload of uploads) {
      try {
        // Try to find the local file
        if (upload.filePath) {
          const filename = path.basename(upload.filePath);
          const fullPath = path.join(uploadsDir, filename);

          if (fs.existsSync(fullPath)) {
            // Read and upload to Cloudinary
            const fileBuffer = fs.readFileSync(fullPath);
            const publicId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const result = await uploadToCloudinary(fileBuffer, 'course_correct', publicId);

            // Update database
            upload.cloudinaryPublicId = result.public_id;
            await upload.save();

            backedUp++;
            console.log(`✓ Backed up: ${upload.title}`);
          } else {
            skipped++;
            console.log(`⊘ Skipped (local file not found): ${upload.title}`);
          }
        } else {
          skipped++;
          console.log(`⊘ Skipped (no local path): ${upload.title}`);
        }
      } catch (err) {
        console.error(`✗ Error backing up ${upload.title}: ${err.message}`);
      }
    }

    console.log(`\n✓ Migration complete!`);
    console.log(`  Backed up: ${backedUp} files`);
    console.log(`  Skipped: ${skipped} files`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

backupExistingFiles();
