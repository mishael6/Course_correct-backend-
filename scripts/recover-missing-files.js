/**
 * Recovery script for missing upload files
 * Finds uploads with missing local files and provides recovery options
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');

dotenv.config();

const Upload = require('../models/Upload');

async function recoverMissingFiles() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/course_correct');
    console.log('Connected to MongoDB\n');

    // Find all uploads with filePath
    const uploads = await Upload.find({ filePath: { $exists: true, $ne: null } });
    const uploadsDir = path.join(__dirname, '../uploads');
    const missing = [];
    const found = [];

    console.log(`Checking ${uploads.length} uploads with local file paths...\n`);

    for (const upload of uploads) {
      const filename = path.basename(upload.filePath);
      const fullPath = path.join(uploadsDir, filename);

      if (fs.existsSync(fullPath)) {
        found.push({
          id: upload._id,
          title: upload.title,
          filename,
          size: fs.statSync(fullPath).size
        });
      } else {
        missing.push({
          id: upload._id,
          title: upload.title,
          filename,
          hasCloudinaryBackup: !!upload.cloudinaryPublicId,
          cloudinaryId: upload.cloudinaryPublicId
        });
      }
    }

    console.log(`✓ Found ${found.length} files on disk`);
    console.log(`✗ Missing ${missing.length} files\n`);

    if (missing.length > 0) {
      console.log('MISSING FILES SUMMARY:');
      console.log('======================\n');

      const withBackup = missing.filter(m => m.hasCloudinaryBackup);
      const withoutBackup = missing.filter(m => !m.hasCloudinaryBackup);

      if (withBackup.length > 0) {
        console.log(`${withBackup.length} files can be recovered from Cloudinary:\n`);
        withBackup.forEach(m => {
          console.log(`  • ${m.title}`);
          console.log(`    ID: ${m.id}`);
          console.log(`    Cloudinary: ${m.cloudinaryId}\n`);
        });

        console.log('\n✓ These files can be automatically recovered by modifying the download');
        console.log('  handlers to use the Cloudinary fallback (already implemented).\n');
      }

      if (withoutBackup.length > 0) {
        console.log(`\n${withoutBackup.length} files have NO backup:\n`);
        withoutBackup.forEach(m => {
          console.log(`  • ${m.title}`);
          console.log(`    ID: ${m.id}`);
          console.log(`    File: ${m.filename}\n`);
        });

        console.log('\n⚠ ACTION REQUIRED: These files need manual recovery:');
        console.log('   1. Reupload the documents through the upload page');
        console.log('   2. Delete these entries and have users reupload\n');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

recoverMissingFiles();
