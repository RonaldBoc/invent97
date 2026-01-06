const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'db', 'invent97.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }
  console.log('[DB] Connected to database');
});

console.log('[DB] Configuring database...');
db.configure('busyTimeout', 5000);

// Run initialization immediately without serialize
console.log('[DB] Creating tables...');
db.run(`CREATE TABLE IF NOT EXISTS equipements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  type_id INTEGER,
  marque TEXT NOT NULL,
  modele TEXT NOT NULL,
  numero_serie TEXT,
  etat TEXT NOT NULL,
  date_achat TEXT,
  lieu_achat TEXT,
  prix REAL,
  garantie_annees INTEGER,
  employe_id INTEGER,
  employe_attribue TEXT,
  commentaire TEXT,
  fichier_facture TEXT,
  date_creation TEXT NOT NULL,
  date_modification TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS employes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT UNIQUE,
  telephone TEXT,
  poste TEXT,
  territoire TEXT NOT NULL,
  commentaire TEXT,
  date_creation TEXT NOT NULL,
  date_modification TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT UNIQUE NOT NULL,
  description TEXT,
  date_creation TEXT NOT NULL,
  date_modification TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipement_id INTEGER NOT NULL,
  categorie TEXT NOT NULL,
  description TEXT,
  date_evenement TEXT NOT NULL,
  document TEXT,
  nouvel_employe_id INTEGER,
  nouvel_etat TEXT,
  date_creation TEXT NOT NULL,
  date_modification TEXT NOT NULL,
  FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
)`);

db.run(`CREATE TABLE IF NOT EXISTS equipement_identifiants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipement_id INTEGER NOT NULL,
  nom TEXT NOT NULL,
  mot_de_passe TEXT NOT NULL,
  date_creation TEXT NOT NULL,
  date_modification TEXT NOT NULL,
  FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
)`);

// Schema migrations with error handling
db.all('PRAGMA table_info(evenements)', (err, columns) => {
  if (!err && columns) {
    if (!columns.some((col) => col.name === 'nouvel_employe_id')) {
      db.run('ALTER TABLE evenements ADD COLUMN nouvel_employe_id INTEGER').catch ? null : null;
    }
    if (!columns.some((col) => col.name === 'nouvel_etat')) {
      db.run('ALTER TABLE evenements ADD COLUMN nouvel_etat TEXT').catch ? null : null;
    }
  }
});

db.all('PRAGMA table_info(equipements)', (err, columns) => {
  if (!err && columns) {
    if (!columns.some((col) => col.name === 'employe_id')) {
      db.run('ALTER TABLE equipements ADD COLUMN employe_id INTEGER').catch ? null : null;
    }
    if (!columns.some((col) => col.name === 'type_id')) {
      db.run('ALTER TABLE equipements ADD COLUMN type_id INTEGER').catch ? null : null;
    }
    if (!columns.some((col) => col.name === 'lieu_achat')) {
      db.run('ALTER TABLE equipements ADD COLUMN lieu_achat TEXT').catch ? null : null;
    }
    if (!columns.some((col) => col.name === 'prix')) {
      db.run('ALTER TABLE equipements ADD COLUMN prix REAL').catch ? null : null;
    }
    if (!columns.some((col) => col.name === 'garantie_annees')) {
      db.run('ALTER TABLE equipements ADD COLUMN garantie_annees INTEGER').catch ? null : null;
    }
  }
});

db.all('PRAGMA table_info(employes)', (err, columns) => {
  if (!err && columns) {
    if (!columns.some((col) => col.name === 'territoire')) {
      db.run('ALTER TABLE employes ADD COLUMN territoire TEXT NOT NULL DEFAULT "martinique"', (alterErr) => {
        if (!alterErr) {
          db.run('UPDATE employes SET territoire = "martinique" WHERE territoire IS NULL').catch ? null : null;
        }
      }).catch ? null : null;
    }
  }
});

module.exports = db;
