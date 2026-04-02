# Hybrid Storage System - Data Loss Prevention

## Overview

The Course Correct system now uses a **hybrid storage approach** to prevent data loss:

- **Local Storage** (`/uploads`): Fast, direct access for serving files to users
- **Cloudinary Backup**: Cloud backup ensures files are never lost, even if local storage fails

## How It Works

### 1. Upload Process

When a student uploads a PDF:

```
Upload Request
    ↓
    ├─ Save to Local Storage (/uploads)
    │  └─ Fast, immediate access
    │
    └─ Backup to Cloudinary (async, non-blocking)
       └─ Permanent cloud storage
```

Both paths are stored in the database:
```javascript
{
  filePath: "/uploads/filename_timestamp.pdf",          // Local
  cloudinaryPublicId: "course_correct/abc123xyz",     // Cloud backup
  fileName: "original_filename.pdf"
}
```

### 2. Admin Review

Admins can see backup status when reviewing pending uploads:

```javascript
{
  backupStatus: {
    hasLocalFile: true,           // ✓ Found on disk
    hasCloudinaryBackup: true,    // ✓ Backed up to cloud
    isSafe: true                  // ✓ File is protected
  }
}
```

**Color indicators in Admin Panel:**
- 🟢 **Green**: File has both local + cloud backup (SAFE)
- 🟡 **Yellow**: File has only local storage (at risk)
- 🔴 **Red**: File has no backup (contact admin)

### 3. Download & Approval

**Admin approves file:**
- Local file remains accessible
- Cloud backup is always available

**Student downloads (after payment):**

```
Download Request
    ↓
    ├─ Try Local Storage first (fast)
    │  └─ If found, serve immediately
    │
    └─ If local not found...
       └─ Use Cloudinary backup (automatic fallback)
```

**Download always succeeds** because of automatic fallback!

## File Safety Guarantees

### Scenario 1: Local Storage Fails
- Student loses local /uploads folder
- Admin reviews → Still can preview from Cloudinary backup
- Student downloads → Automatic fallback to Cloudinary
- **Result: No data loss** ✓

### Scenario 2: Server Restart
- Local cache might be cleared
- Files are restored from Cloudinary on first access
- **Result: No permanent loss** ✓

### Scenario 3: Accidental Deletion
- Admin or system deletes local files
- Cloudinary backup still exists
- **Result: File can be recovered** ✓

## Admin Features

### View Backup Status
Endpoint: `GET /api/admin/uploads` (pending only)

Shows backup status for each pending upload:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "Financial Accounting",
  "status": "pending",
  "filePath": "/uploads/Financial_Accounting_1775133211016.pdf",
  "cloudinaryPublicId": "course_correct/backup_abc123",
  "backupStatus": {
    "hasLocalFile": true,
    "hasCloudinaryBackup": true,
    "isSafe": true
  }
}
```

### Backup Existing Uploads (One-time Migration)

Run this script to back up all existing approved files:

```bash
node scripts/backup-existing-uploads.js
```

This command:
1. Finds all approved uploads without Cloudinary backup
2. Uploads them to Cloudinary
3. Updates the database
4. Shows progress and summary

## Testing Data Loss Prevention

### Test 1: Local File Missing
```bash
# Delete a local file
rm backend/uploads/some_file.pdf

# Try to download
# - API returns Cloudinary URL
# - File still downloads successfully
```

### Test 2: Verify Admin Can Review
1. Go to Admin Panel
2. View pending uploads
3. See "View PDF" button can open files (from local or Cloudinary)

### Test 3: Verify Student Can Download After Approval
1. Admin approves file
2. Student purchases/subscribes
3. Click download
4. File downloads successfully (even if local copy missing)

## Configuration

### Cloudinary Integration

Make sure your `.env` has:
```
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Storage Limits

- **Cloudinary Free Tier**: 25GB storage (sufficient for most institutions)
- **Local Storage**: Flexible, depends on server disk space
- Cloudinary will still serve files even if local storage is full

## What Happens to Failed Uploads?

If Cloudinary backup fails:
- File still saves locally
- Warning logged: "⚠ Cloudinary backup failed"
- Upload continues (doesn't fail)
- Admin sees `isSafe: false` in pending uploads
- **Recommendation**: Manually retry backup or contact Cloudinary support

## Rollback / Recovery

If a file is lost and you have Cloudinary backup:

```bash
# List files in Cloudinary
cloudinary admin uploads

# Download from Cloudinary
cloudinary download [public_id]
```

## Summary: Before vs After

### Before (Local Only)
- ❌ Files lost if server crashes
- ❌ No backup mechanism
- ❌ No data redundancy
- ❌ Difficult to recover

### After (Hybrid Storage)
- ✅ Automatic cloud backup
- ✅ Fallback to Cloudinary
- ✅ Data redundancy
- ✅ Easy recovery
- ✅ Zero downtime
- ✅ Admin can always review

## Next Steps

1. **Deploy changes** to production (Render)
2. **Run migration** to back up existing files:
   ```bash
   node scripts/backup-existing-uploads.js
   ```
3. **Test** with new uploads to confirm backups work
4. **Monitor** logs for any backup failures
