const Upload = require('../models/Upload');
const Withdrawal = require('../models/Withdrawal');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const payloqa = require('../services/payloqa');

const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0')) return `+233${digits.slice(1)}`;
  return `+${digits}`;
};

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [
      totalUploads, pendingUploads, approvedUploads, rejectedUploads,
      pendingWithdrawals, totalUsers, totalStudents
    ] = await Promise.all([
      Upload.countDocuments(),
      Upload.countDocuments({ status: 'pending' }),
      Upload.countDocuments({ status: 'approved' }),
      Upload.countDocuments({ status: 'rejected' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
    ]);

    // Total withdrawn
    const withdrawalAgg = await Withdrawal.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      totalUploads, pendingUploads, approvedUploads, rejectedUploads,
      pendingWithdrawals, totalUsers, totalStudents,
      totalWithdrawn: withdrawalAgg[0]?.total || 0
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/admin/uploads/pending ──────────────────────────────────────────
exports.getPendingUploads = async (req, res) => {
  try {
    const uploads = await Upload.find({ status: 'pending' })
      .populate('uploader', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(uploads);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/admin/uploads ───────────────────────────────────────────────────
exports.getAllUploads = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: 'i' };

    const uploads = await Upload.find(query)
      .populate('uploader', 'name email')
      .select('-filePath -fileUrl -supabasePath -cloudinaryPublicId')
      .sort({ createdAt: -1 });
    res.json(uploads);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── PUT /api/admin/uploads/:id/status ───────────────────────────────────────
exports.updateUploadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const upload = await Upload.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('uploader', 'name phone');

    if (!upload) return res.status(404).json({ message: 'Upload not found' });

    if (upload.uploader?.phone) {
      const phone = toE164(upload.uploader.phone);
      const message = status === 'approved'
        ? payloqa.sms.uploadApproved(upload.title)
        : payloqa.sms.uploadRejected(upload.title);
      await payloqa.sendSMS(phone, message);
    }

    res.json(upload);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/admin/withdrawals/pending ──────────────────────────────────────
exports.getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── PUT /api/admin/withdrawals/:id/approve ───────────────────────────────────
exports.approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('user', 'name phone');
    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid withdrawal record' });
    }

    withdrawal.status = 'approved';
    await withdrawal.save();

    if (withdrawal.user?.phone) {
      await payloqa.sendSMS(
        toE164(withdrawal.user.phone),
        payloqa.sms.withdrawalApproved(withdrawal.amount.toFixed(2))
      );
    }

    res.json({ message: 'Withdrawal approved', withdrawal });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── PUT /api/admin/withdrawals/:id/reject ────────────────────────────────────
exports.rejectWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('user', 'name phone');
    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Invalid withdrawal record' });
    }

    withdrawal.status = 'rejected';
    await withdrawal.save();

    const wallet = await Wallet.findOne({ user: withdrawal.user._id });
    if (wallet) {
      wallet.balance += withdrawal.amount;
      await wallet.save();
    }

    if (withdrawal.user?.phone) {
      await payloqa.sendSMS(
        toE164(withdrawal.user.phone),
        payloqa.sms.withdrawalRejected(withdrawal.amount.toFixed(2))
      );
    }

    res.json({ message: 'Withdrawal rejected', withdrawal });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });

    // Get wallet balances
    const wallets = await Wallet.find({ user: { $in: users.map(u => u._id) } });
    const walletMap = {};
    wallets.forEach(w => { walletMap[w.user.toString()] = w; });

    const result = users.map(u => ({
      ...u.toObject(),
      balance: walletMap[u._id.toString()]?.balance || 0,
      totalEarnings: walletMap[u._id.toString()]?.totalEarnings || 0,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};
