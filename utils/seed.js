// Creates an initial superadmin account for local development.
// Usage: npm run seed  (reads SEED_EMAIL / SEED_PASSWORD / SEED_NAME from env, with fallbacks)
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function seed() {
  await connectDB();

  const email = process.env.SEED_EMAIL || 'admin@gmail.com';
  const password = process.env.SEED_PASSWORD || 'admin@123';
  const name = process.env.SEED_NAME || 'Admin';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] user ${email} already exists, skipping`);
  } else {
    await User.create({ name, email, password, role: 'superadmin' });

    
    console.log(`[seed] created superadmin: ${email} / ${password}`);
    console.log('[seed] change this password after first login');
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
