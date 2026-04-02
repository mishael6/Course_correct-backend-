const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cloudinary = require('./config/cloudinary');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/course_correct')
  .then(async () => {
    const Upload = require('./models/Upload');
    const uploads = await Upload.find({}).limit(5);
    
    console.log('\n📂 Upload Records:\n');
    uploads.forEach(u => {
      console.log('Title:', u.title);
      console.log('Local Path:', u.filePath || 'none');
      console.log('Cloudinary ID:', u.cloudinaryPublicId || 'none');
      
      // Test cloudinary URL generation
      if (u.cloudinaryPublicId) {
        const testUrl = cloudinary.url(u.cloudinaryPublicId, {
          resource_type: 'raw',
          type: 'upload',
          secure: true
        });
        console.log('Generated URL:', testUrl);
      }
      console.log('---\n');
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
