const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'invent97.db');
const backupDir = path.join(__dirname, 'db', 'backups');

function timestamp() {
  const now = new Date();
  const pad = (value) => value.toString().padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}

function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

(function runBackup() {
  ensureBackupDir();

  if (!fs.existsSync(dbPath)) {
    console.error('Base de données introuvable. Lancez l\'application au moins une fois avant de lancer la sauvegarde.');
    process.exit(1);
  }

  const destination = path.join(backupDir, `invent97-backup-${timestamp()}.db`);

  try {
    fs.copyFileSync(dbPath, destination);
    console.log(`Sauvegarde créée: ${destination}`);
  } catch (err) {
    console.error('Impossible de sauvegarder la base de données:', err);
    process.exit(1);
  }
})();
