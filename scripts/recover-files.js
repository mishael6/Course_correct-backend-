#!/usr/bin/env node

/**
 * File Recovery CLI Tool
 * Run from backend directory: node scripts/recover-files.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fileRecovery = require('../services/fileRecovery');

const main = async () => {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected!\n');

    // Run recovery
    const result = await fileRecovery.recoverAllMissing();

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Recovery complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Recovery failed:', err.message);
    process.exit(1);
  }
};

main();
