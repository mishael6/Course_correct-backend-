/**
 * Cleanup script for orphan upload entries
 * Removes database entries for files that don't exist and have no backup
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const Upload = require('../models/Upload');

async function cleanupOrphanEntries() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/course_correct');
    console.log('Connected to MongoDB\n');

    // Find all uploads with filePath
    const uploads = await Upload.find({ filePath: { $exists: true, $ne: null } });
    const uploadsDir = path.join(__dirname, '../uploads');
    let deleted = 0;

    console.log(`Scanning ${uploads.length} uploads...\n`);

    for (const upload of uploads) {
      const filename = path.basename(upload.filePath);
      const fullPath = path.join(uploadsDir, filename);

      // If file doesn't exist and has no Cloudinary backup
      if (!fs.existsSync(fullPath) && !upload.cloudinaryPublicId) {
        await Upload.deleteOne({ _id: upload._id });
        deleted++;
        console.log(`✓ Deleted orphan entry: ${upload.title} (${filename})`);
      }
    }

    console.log(`\n✓ Cleanup complete! Deleted ${deleted} orphan entries.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

cleanupOrphanEntries();
