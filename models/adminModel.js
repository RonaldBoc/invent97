const bcrypt = require('bcrypt');
const db = require('./db');

const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function getAdminByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM admin WHERE username = ?', [username], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

async function ensureAdminSeeded() {
  const existing = await getAdminByUsername(DEFAULT_ADMIN_USERNAME);
  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO admin (username, password_hash) VALUES (?, ?)',
      [DEFAULT_ADMIN_USERNAME, passwordHash],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });

  console.info('Admin user created with default credentials. Please update the password after first login.');
}

async function validateAdminCredentials(username, password) {
  const admin = await getAdminByUsername(username);
  if (!admin) {
    return false;
  }

  const match = await bcrypt.compare(password, admin.password_hash);
  return match ? admin : false;
}

module.exports = {
  getAdminByUsername,
  ensureAdminSeeded,
  validateAdminCredentials
};
