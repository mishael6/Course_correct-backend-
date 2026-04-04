const express = require('express');
const router = express.Router();
const { getPublicSettings } = require('../controllers/settingsController');

// Public — frontend needs subscription price, price range etc
router.get('/', getPublicSettings);

module.exports = router;