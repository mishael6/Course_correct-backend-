const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;

// Load environment variables first
dotenv.config();

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Verify configuration loaded
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.warn('⚠ WARNING: CLOUDINARY_CLOUD_NAME environment variable not set');
}
if (!process.env.CLOUDINARY_API_KEY) {
  console.warn('⚠ WARNING: CLOUDINARY_API_KEY environment variable not set');
}

module.exports = cloudinary;