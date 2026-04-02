const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getWallet, requestWithdrawal } = require('../controllers/walletController');

router.get('/', auth, getWallet);
router.post('/withdraw', auth, requestWithdrawal);

module.exports = router;
