require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { poolPromise } = require('./src/config/db');

const run = async () => {
  const pool = await poolPromise;
  const sqlPath = path.join(__dirname, 'sql', 'password_reset_otp.sql');
  const batches = fs.readFileSync(sqlPath, 'utf8')
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);

  for (const batch of batches) {
    await pool.request().batch(batch);
  }

  console.log('[MIGRATION] Da bo sung cac cot OTP cho bang NguoiDung.');
  await pool.close();
};

run().catch((error) => {
  console.error('[MIGRATION] That bai:', error.message);
  process.exitCode = 1;
});
