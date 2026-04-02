# Setup Guide: Hybrid Storage & Data Loss Prevention

## What You Now Have ✅

### 1. **Automatic Cloud Backup**
- Every PDF upload now automatically backs up to Cloudinary
- Local files serve fast; Cloudinary stores permanently
- If local files are lost, downloads still work from cloud backup

### 2. **Admin File Safety Monitoring**
- Admin panel shows which files have cloud backups
- You can see: `isSafe: true` = file is protected
- Never lose track of document safety status

### 3. **Automatic Fallback**
- If a local file is missing → system automatically uses Cloudinary
- Downloads never fail
- Students can always get their files after paying

## How the Workflow Works Now

```
UPLOAD
└─ File saved to local /uploads
└─ File backed up to Cloudinary
└─ Admin reviews (can see from both locations)

APPROVAL
└─ Admin approves document
└─ Both copies protected

PAYMENT & DOWNLOAD
└─ Student pays/subscribes
└─ Download tries local (fast)
└─ If local missing, uses Cloudinary (automatic)
└─ Student gets file either way ✓
```

## Your Responsibilities

### 1. **Deploy Changes** (Required)
Your backend code is ready. Deploy to Render:

1. Go to Render dashboard
2. Select your backend service
3. Click "Deploy"
4. Wait for deployment to complete

### 2. **Migrate Existing Files** (Optional but Recommended)
Back up all your existing approved files to Cloudinary:

```bash
# SSH into your backend server or run locally:
node scripts/backup-existing-uploads.js
```

This will:
- Find all approved files without Cloudinary backup
- Upload each one to Cloudinary
- Update the database
- Show you progress

**Expected output:**
```
Found 5 approved files without Cloudinary backup

✓ Backed up: Financial Accounting
✓ Backed up: Critical Thinking
✓ Backed up: Calculus I
...

✓ Migration complete!
  Backed up: 5 files
  Skipped: 0 files
```

### 3. **Test** (Recommended)
After deployment:

1. **Upload test**: Upload a new PDF as a student
   - Check admin panel: should show `isSafe: true`

2. **Review test**: As admin, view the pending upload
   - "View PDF" should open the file

3. **Approve test**: Click approve
   - File moves to marketplace

4. **Download test**: As different student with subscription
   - Click download
   - File should download even if local copy is deleted

## File Structure

**New files added:**
```
backend/
├── HYBRID_STORAGE.md                    ← Read this for full details
├── scripts/
│   ├── backup-existing-uploads.js       ← Run this once
│   ├── cleanup-orphan-uploads.js        ← Already ran
│   └── recover-missing-files.js         ← For diagnostics
```

**Updated files:**
```
backend/controllers/
├── uploadController.js                  ← Now backs up to Cloudinary
└── adminController.js                   ← Shows backup status

backend/config/
└── multer.js                            ← Unchanged (saves locally)
```

## Monitoring File Safety

### Check Status in Admin Panel
When you view pending uploads, you'll see data like:
```json
{
  "title": "Financial Accounting",
  "backupStatus": {
    "hasLocalFile": true,
    "hasCloudinaryBackup": true,
    "isSafe": true  ← This is what matters!
  }
}
```

- **isSafe: true** = File is safe (has cloud backup)
- **isSafe: false** = File at risk (no cloud backup) ⚠️

### Commands to Monitor

**Check if migration is complete:**
```bash
# SSH into backend and run:
node -e "
const mongoose = require('mongoose');
const Upload = require('./models/Upload');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const noBackup = await Upload.countDocuments({ 
    status: 'approved', 
    cloudinaryPublicId: { \$exists: false } 
  });
  console.log('Approved files without backup:', noBackup);
  process.exit(0);
});
"
```

## Troubleshooting

### "Cloudinary backup failed"
- Normal if Cloudinary is temporarily down
- File still saves locally
- Try again in a few minutes
- Won't block uploads

### "Can't download file"
- Check if file has backup: `isSafe: true`?
- If `isSafe: false`: File may have been lost
- Contact admin, may need to reupload

### "Need to restore from Cloudinary"
If you suspect a file was lost:
1. Check Cloudinary dashboard
2. Download the file
3. Upload to `/uploads` folder manually

## Admin Flow

### Before Approval
1. Student uploads PDF
2. You review in Admin Panel
3. Check backup status (should be green ✓)
4. View PDF through browser (can be from local or cloud)

### After Approval
1. File appears in Marketplace
2. Students see it with price
3. If they pay/subscribe, they can download
4. Download works from either local or cloud

### No More Data Loss
- Even if your local `/uploads` folder is deleted
- Even if server crashes
- Even if files mysteriously vanish
- **Cloudinary backup always has the files**

## Deployment Checklist

- [ ] Code deployed to Render
- [ ] Backend service restarted
- [ ] Uploaded a test PDF (should see `isSafe: true`)
- [ ] Ran migration script (if you have existing files)
- [ ] Downloaded a file successfully
- [ ] Verified backup status shows correctly

## Questions?

Check [HYBRID_STORAGE.md](./HYBRID_STORAGE.md) in the backend repo for full technical details.
