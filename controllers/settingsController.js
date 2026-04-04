const Settings = require('../models/Settings');

// ─── Helper: get or create settings ──────────────────────────────────────────
const getSettings = async () => {
  let settings = await Settings.findOne({ singleton: true });
  if (!settings) {
    settings = await Settings.create({ singleton: true });
  }
  return settings;
};

// ─── GET /api/settings — public (frontend needs subscription price etc) ───────
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      subscriptionPrice: settings.subscriptionPrice,
      minUploadPrice: settings.minUploadPrice,
      maxUploadPrice: settings.maxUploadPrice,
      uploaderCommissionPercent: settings.uploaderCommissionPercent,
      maxFileSizeMB: settings.maxFileSizeMB,
      platformName: settings.platformName,
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── GET /api/admin/settings — full settings for admin ───────────────────────
exports.getAdminSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

// ─── PUT /api/admin/settings — update settings ───────────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    const {
      subscriptionPrice,
      minUploadPrice,
      maxUploadPrice,
      uploaderCommissionPercent,
      maxFileSizeMB,
      platformName,
      supportEmail,
    } = req.body;

    // Validate
    if (subscriptionPrice !== undefined && subscriptionPrice < 1) {
      return res.status(400).json({ message: 'Subscription price must be at least GHS 1' });
    }
    if (minUploadPrice !== undefined && maxUploadPrice !== undefined && minUploadPrice >= maxUploadPrice) {
      return res.status(400).json({ message: 'Min price must be less than max price' });
    }
    if (uploaderCommissionPercent !== undefined && (uploaderCommissionPercent < 1 || uploaderCommissionPercent > 99)) {
      return res.status(400).json({ message: 'Commission must be between 1% and 99%' });
    }

    const settings = await getSettings();

    if (subscriptionPrice !== undefined) settings.subscriptionPrice = Number(subscriptionPrice);
    if (minUploadPrice !== undefined) settings.minUploadPrice = Number(minUploadPrice);
    if (maxUploadPrice !== undefined) settings.maxUploadPrice = Number(maxUploadPrice);
    if (uploaderCommissionPercent !== undefined) settings.uploaderCommissionPercent = Number(uploaderCommissionPercent);
    if (maxFileSizeMB !== undefined) settings.maxFileSizeMB = Number(maxFileSizeMB);
    if (platformName !== undefined) settings.platformName = platformName;
    if (supportEmail !== undefined) settings.supportEmail = supportEmail;

    settings.updatedBy = req.user.id;
    await settings.save();

    res.json({ message: 'Settings updated successfully', settings });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

module.exports.getSettings = getSettings;