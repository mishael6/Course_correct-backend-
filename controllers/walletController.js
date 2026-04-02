const Wallet = require('../models/Wallet');
const Withdrawal = require('../models/Withdrawal');

exports.getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user.id });
    res.json(wallet);
  } catch (err) {
    res.status(500).send('Server Error');
  }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount } = req.body;
    const wallet = await Wallet.findOne({ user: req.user.id });
    
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    wallet.balance -= amount;
    await wallet.save();
    
    const withdrawal = new Withdrawal({
      user: req.user.id,
      amount
    });
    await withdrawal.save();
    
    res.status(201).json({ message: 'Withdrawal requested successfully', withdrawal, wallet });
  } catch (err) {
    res.status(500).send('Server Error');
  }
};
