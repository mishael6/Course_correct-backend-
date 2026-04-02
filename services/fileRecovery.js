/**
 * File Recovery Service
 * Automatically restores missing files from Cloudinary backup
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cloudinary = require('../config/cloudinary');
const Upload = require('../models/Upload');

const uploadsDir = path.join(__dirname, '../uploads');

/**
 * Download file from URL and save to disk
 */
const downloadFileFromUrl = async (url, filePath) => {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      timeout: 30000
    });

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      response.data.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file on error
        reject(err);
      });
    });
  } catch (err) {
    throw new Error(`Failed to download from URL: ${err.message}`);
  }
};

/**
 * Recover a single upload from Cloudinary backup
 */
exports.recoverUpload = async (uploadId) => {
  try {
    const upload = await Upload.findById(uploadId);
    
    if (!upload) {
      return { success: false, message: 'Upload not found' };
    }

    if (!upload.cloudinaryPublicId) {
      return { success: false, message: 'No Cloudinary backup available' };
    }

    // Generate the filename from filePath if available
    let filename = null;
    if (upload.filePath) {
      filename = path.basename(upload.filePath);
    } else if (upload.fileName) {
      filename = `${upload.fileName.replace(/\.pdf$/i, '')}_${Date.now()}.pdf`;
    } else {
      filename = `recovered_${uploadId}_${Date.now()}.pdf`;
    }

    const fullPath = path.join(uploadsDir, filename);

    // Generate Cloudinary download URL
    const cloudinaryUrl = cloudinary.url(upload.cloudinaryPublicId, {
      resource_type: 'raw',
      type: 'upload',
      secure: true,
      format: 'pdf'
    });

    console.log(`🔄 Recovering ${upload.title} from Cloudinary...`);
    console.log(`   Cloud ID: ${upload.cloudinaryPublicId}`);
    console.log(`   Download URL: ${cloudinaryUrl}`);

    // Download and save
    await downloadFileFromUrl(cloudinaryUrl, fullPath);

    // Update database with new file path if it changed
    if (!upload.filePath || upload.filePath !== `/uploads/${filename}`) {
      upload.filePath = `/uploads/${filename}`;
      await upload.save();
    }

    console.log(`✅ Successfully recovered: ${filename}`);
    return {
      success: true,
      message: `File recovered successfully`,
      title: upload.title,
      filename,
      size: fs.statSync(fullPath).size
    };
  } catch (err) {
    console.error(`❌ Recovery failed for ${uploadId}: ${err.message}`);
    return {
      success: false,
      message: `Recovery failed: ${err.message}`,
      uploadId
    };
  }
};

/**
 * Check all uploads for missing files and attempt recovery
 */
exports.recoverAllMissing = async () => {
  try {
    console.log('\n📋 Checking all uploads for missing files...\n');

    const uploads = await Upload.find({ 
      status: 'approved',
      filePath: { $exists: true, $ne: null }
    });

    let recovered = 0;
    let failed = 0;
    let alreadyExists = 0;

    for (const upload of uploads) {
      const filename = path.basename(upload.filePath);
      const fullPath = path.join(uploadsDir, filename);

      if (fs.existsSync(fullPath)) {
        alreadyExists++;
        console.log(`✓ ${upload.title} - OK`);
      } else if (upload.cloudinaryPublicId) {
        // File missing, but backup exists - try to recover
        const result = await exports.recoverUpload(upload._id);
        if (result.success) {
          recovered++;
        } else {
          failed++;
        }
      } else {
        failed++;
        console.log(`✗ ${upload.title} - No backup available`);
      }
    }

    const summary = `
🎯 FILE RECOVERY SUMMARY
========================
✅ Already exist: ${alreadyExists}
✅ Recovered: ${recovered}
❌ Failed: ${failed}
📊 Total checked: ${uploads.length}
========================`;

    console.log(summary);
    return { alreadyExists, recovered, failed, total: uploads.length };
  } catch (err) {
    console.error('Recovery check failed:', err.message);
    throw err;
  }
};

/**
 * Export recovery information (for admin dashboard)
 */
exports.getRecoveryStatus = async () => {
  try {
    const uploads = await Upload.find({ 
      status: 'approved',
      filePath: { $exists: true, $ne: null }
    });

    const status = [];

    for (const upload of uploads) {
      const filename = path.basename(upload.filePath);
      const fullPath = path.join(uploadsDir, filename);
      const fileExists = fs.existsSync(fullPath);

      status.push({
        id: upload._id,
        title: upload.title,
        fileExists,
        hasBackup: !!upload.cloudinaryPublicId,
        canRecover: !fileExists && !!upload.cloudinaryPublicId,
        filePath: upload.filePath,
        cloudinaryId: upload.cloudinaryPublicId
      });
    }

    return {
      totalApproved: uploads.length,
      filesExisting: status.filter(s => s.fileExists).length,
      filesRecoverable: status.filter(s => s.canRecover).length,
      uploads: status
    };
  } catch (err) {
    console.error('Status check failed:', err.message);
    throw err;
  }
};
