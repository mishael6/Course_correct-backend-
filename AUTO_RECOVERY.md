## File Auto-Recovery System

### Overview

The auto-recovery system automatically restores missing uploaded files from Cloudinary backups. This solves the **data loss problem** that occurs when Render's ephemeral storage is reset during redeploys.

**How It Works**: When a student tries to download a file and the local file is missing, the system automatically restores it from the Cloudinary backup before serving it.

---

## 🎯 How Recovery Works

### For Students (Automatic)
1. Student clicks "Download" on a document
2. System checks if file exists on disk
3. **If missing** → System automatically downloads file from Cloudinary backup
4. File is restored to `/uploads/` folder
5. Student receives the file ✅

**From the student's perspective**: The download just takes a little longer the first time after a redeploy, but it always works.

### For Admins (Manual Controls)

#### Check Recovery Status
```
GET /admin/recovery/status
```
Returns:
- Total approved uploads
- How many files currently exist locally
- How many files are recoverable from backup
- Detailed list of each file

Example response:
```json
{
  "totalApproved": 15,
  "filesExisting": 14,
  "filesRecoverable": 1,
  "uploads": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Financial Accounting.pdf",
      "fileExists": false,
      "hasBackup": true,
      "canRecover": true,
      "filePath": "/uploads/Financial Accounting_1699564800000.pdf",
      "cloudinaryId": "course_correct/507f1f77bcf86cd799439011"
    }
  ]
}
```

#### Manually Recover a Single File
```
POST /admin/recovery/{uploadId}
```

Example:
```bash
curl -X POST "http://localhost:5000/admin/recovery/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer <admin_token>"
```

Response:
```json
{
  "message": "File recovered successfully",
  "success": true,
  "title": "Financial Accounting.pdf",
  "filename": "Financial Accounting_1699564800000.pdf",
  "size": 2457632
}
```

#### Recover All Missing Files
```
POST /admin/recovery-all/run
```

Automatically restores **all** missing files from Cloudinary backups in one operation.

Example:
```bash
curl -X POST "http://localhost:5000/admin/recovery-all/run" \
  -H "Authorization: Bearer <admin_token>"
```

Response:
```json
{
  "message": "Recovery process completed",
  "summary": {
    "alreadyExists": 14,
    "recovered": 1,
    "failed": 0,
    "total": 15
  }
}
```

---

## 🛠️ Command-Line Tool

For quick recovery without the API, use the CLI tool:

```bash
# From backend directory
node scripts/recover-files.js
```

Output:
```
🔗 Connecting to MongoDB...
✅ Connected!

📋 Checking all uploads for missing files...

✓ Financial Accounting - OK
🔄 Recovering Critical Thinking from Cloudinary...
   Cloud ID: course_correct/507f1f77bcf86cd799439012
✅ Successfully recovered: Critical Thinking_1699564800001.pdf

🎯 FILE RECOVERY SUMMARY
========================
✅ Already exist: 14
✅ Recovered: 1
❌ Failed: 0
📊 Total checked: 15
========================
```

---

## 🔒 Safety Guarantees

### What's Protected
✅ **Backed up to Cloudinary** → File can be recovered  
✅ **Local file exists** → No action needed  
✅ **No local file, but backup exists** → Auto-recovers on download  

### What's NOT Protected
❌ **No local file + No Cloudinary backup** → File is lost (this shouldn't happen)

### Recovery Requirements
- ✅ Cloudinary credentials configured (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- ✅ MongoDB database accessible
- ✅ `/uploads` directory exists and is writable
- ✅ Cloudinary API rate limits not exceeded
- ✅ Network connection to Cloudinary and MongoDB

---

## 📊 Monitoring

### Check Which Files Need Recovery

```bash
# Check recovery status
curl http://localhost:5000/admin/recovery/status \
  -H "Authorization: Bearer <admin_token>" | jq '.uploads[] | select(.canRecover)'
```

### Logs to Watch

The system logs recovery operations to console:

```
✓ Title - OK                          # File exists locally
🔄 Recovering Title from Cloudinary...  # Starting recovery
✅ Successfully recovered: Title.pdf    # Recovery succeeded
✗ Title - No backup available          # File lost (data loss!)
❌ Recovery failed: timeout             # Cloudinary error
```

---

## ⚙️ How It's Implemented

### Upload Flow (When File is Saved)
```
1. Student uploads PDF → Multer saves to /uploads/filename.pdf
2. File is read from disk
3. Uploaded to Cloudinary as backup
4. Database records both locations:
   - filePath: /uploads/filename.pdf
   - cloudinaryPublicId: course_correct/uploadId
```

### Download Flow (When Student Requests File)
```
1. Admin requests file download
2. Check if /uploads/filename.pdf exists
   ✅ YES → Serve immediately
   ❌ NO → Check if cloudinaryPublicId exists
      ✅ YES → Auto-recover from Cloudinary, then serve
      ❌ NO → Return 404 (file is lost)
```

### Recovery Process
```
1. Get Cloudinary download URL from cloudinaryPublicId
2. Stream download from Cloudinary
3. Save to /uploads/ directory
4. Update database with new filePath if needed
5. File now available locally (until next Render redeploy)
```

---

## 🚨 Known Limitations

1. **Render Redeploys Delete Files**
   - After each redeploy, `/uploads` is empty until accessed
   - Recovery happens automatically on first download (slower)
   - To avoid this permanently: Enable Render persistent disk ($7/month)

2. **Recovery Speed**
   - First download after redeploy is slower (10-30 seconds)
   - Subsequent downloads are instant (from local storage)

3. **Cloudinary Rate Limits**
   - Free tier: 50 restored files per hour
   - If exceeded: Wait 1 hour or upgrade Cloudinary plan

4. **Bandwidth Costs**
   - If many files are recovered in short time, uses Cloudinary bandwidth
   - Free tier: 25GB/month included

---

## 🎬 Testing Recovery

### Test 1: Automatic Recovery on Download
```bash
# 1. Upload a file normally (creates backup)
# 2. Manually delete the local file:
rm backend/uploads/TestDoc_*.pdf

# 3. Try to download (should auto-recover)
curl http://localhost:5000/uploads/TestDoc_.pdf

# ✅ File should be served (recovered automatically)
```

### Test 2: Manual Recovery via API
```bash
# 1. Find upload ID from database or admin panel
uploadId="507f1f77bcf86cd799439011"

# 2. Delete local file
rm backend/uploads/TestDoc_*.pdf

# 3. Trigger recovery
curl -X POST "http://localhost:5000/admin/recovery/$uploadId" \
  -H "Authorization: Bearer <admin_token>"

# ✅ Response: "File recovered successfully"

# 4. Verify file exists
ls -lh backend/uploads/ | grep TestDoc
```

### Test 3: Batch Recovery
```bash
# 1. Delete all local files
rm -rf backend/uploads/*

# 2. Trigger batch recovery
curl -X POST "http://localhost:5000/admin/recovery-all/run" \
  -H "Authorization: Bearer <admin_token>"

# ✅ Response shows count of recovered files
```

---

## 🔧 Troubleshooting

### Issue: "Recovery failed: No such file or directory"
**Cause**: `/uploads` directory doesn't exist  
**Fix**: Create it: `mkdir -p backend/uploads`

### Issue: "Recovery failed: timeout"
**Cause**: Cloudinary API unreachable or very slow  
**Fix**: 
- Check internet connection
- Verify Cloudinary credentials are correct
- Try again (might be temporary)

### Issue: "Recovery failed: ERR_INVALID_ARG_TYPE"
**Cause**: Invalid Cloudinary ID or configuration  
**Fix**:
- Verify `CLOUDINARY_CLOUD_NAME` is set correctly
- Check that file was actually uploaded to Cloudinary
- Run diagnostic: `node scripts/recover-missing-files.js`

### Issue: Files Never Recovered
**Cause**: Missing Cloudinary backup  
**Fix**: 
- Run backup script on existing files: `node scripts/backup-existing-uploads.js`
- Ensure new uploads have `cloudinaryPublicId` in database
- Check Upload schema has both fields: `filePath` and `cloudinaryPublicId`

---

## 📚 Related Documentation

- [Hybrid Storage System](./HYBRID_STORAGE.md) - Technical architecture
- [Setup Guide](./SETUP_HYBRID_STORAGE.md) - Initial deployment steps
- [Cloudinary Config](./config/cloudinary.js) - Backup configuration
- [Upload Model](./models/Upload.js) - Database schema

---

## 🎓 Summary

| Scenario | What Happens | User Experience |
|----------|--------------|-----------------|
| **Normal download** | Served from local disk | ⚡ Instant |
| **After Render redeploy** | Auto-recovered on first request | 🔄 Slower first time, instant after |
| **Admin triggers recovery** | Manual restore via API | ✅ All files restored immediately |
| **File never backed up** | Returns 404 error | ❌ File is lost |

**Bottom Line**: Your files are safe as long as they were uploaded successfully to Cloudinary (which happens automatically). Render's redeploys won't cause data loss - just a brief delay on the first download after a redeploy.
