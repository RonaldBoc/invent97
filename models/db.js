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
    return;
  }

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS equipements (
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS employes (
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT UNIQUE NOT NULL,
        description TEXT,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS evenements (
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS equipement_identifiants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipement_id INTEGER NOT NULL,
        nom TEXT NOT NULL,
        mot_de_passe TEXT NOT NULL,
        date_creation TEXT NOT NULL,
        date_modification TEXT NOT NULL,
        FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
      )
    `);

    db.all('PRAGMA table_info(evenements)', (eventsPragmaErr, eventColumns) => {
      if (eventsPragmaErr) {
        console.error('Failed to inspect evenements table:', eventsPragmaErr);
        return;
      }

      const hasNouvelEmployeId = eventColumns.some((column) => column.name === 'nouvel_employe_id');
      if (!hasNouvelEmployeId) {
        db.run('ALTER TABLE evenements ADD COLUMN nouvel_employe_id INTEGER', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add nouvel_employe_id column to evenements table:', alterErr);
          }
        });
      }

      const hasNouvelEtat = eventColumns.some((column) => column.name === 'nouvel_etat');
      if (!hasNouvelEtat) {
        db.run('ALTER TABLE evenements ADD COLUMN nouvel_etat TEXT', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add nouvel_etat column to evenements table:', alterErr);
          }
        });
      }
    });

    db.all('PRAGMA table_info(equipements)', (pragmaErr, columns) => {
      if (pragmaErr) {
        console.error('Failed to inspect equipements table:', pragmaErr);
        return;
      }

      const hasEmployeId = columns.some((column) => column.name === 'employe_id');
      if (!hasEmployeId) {
        db.run('ALTER TABLE equipements ADD COLUMN employe_id INTEGER', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add employe_id column to equipements table:', alterErr);
          }
        });
      }

      const hasTypeId = columns.some((column) => column.name === 'type_id');
      if (!hasTypeId) {
        db.run('ALTER TABLE equipements ADD COLUMN type_id INTEGER', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add type_id column to equipements table:', alterErr);
          }
        });
      }

      const hasNumeroSerie = columns.some((column) => column.name === 'numero_serie' && column.notnull === 1);
      if (hasNumeroSerie) {
        db.run('ALTER TABLE equipements RENAME TO equipements_old', (renameErr) => {
          if (renameErr) {
            console.error('Failed to rename equipements table during numero_serie migration:', renameErr);
            return;
          }

          db.run(`
            CREATE TABLE equipements (
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
            )
          `, (createErr) => {
            if (createErr) {
              console.error('Failed to recreate equipements table during numero_serie migration:', createErr);
              return;
            }

            db.run(`
              INSERT INTO equipements (
                id, type, type_id, marque, modele, numero_serie, etat, date_achat,
                lieu_achat, prix, garantie_annees, employe_id, employe_attribue,
                commentaire, fichier_facture, date_creation, date_modification
              )
              SELECT
                id, type, type_id, marque, modele, numero_serie, etat, date_achat,
                lieu_achat, prix, garantie_annees, employe_id, employe_attribue,
                commentaire, fichier_facture, date_creation, date_modification
              FROM equipements_old
            `, (copyErr) => {
              if (copyErr) {
                console.error('Failed to copy data back during numero_serie migration:', copyErr);
                return;
              }

              db.run('DROP TABLE equipements_old', (dropErr) => {
                if (dropErr) {
                  console.error('Failed to drop old equipements table during numero_serie migration:', dropErr);
                }
              });
            });
          });
        });
      }

      const hasLieuAchat = columns.some((column) => column.name === 'lieu_achat');
      if (!hasLieuAchat) {
        db.run('ALTER TABLE equipements ADD COLUMN lieu_achat TEXT', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add lieu_achat column to equipements table:', alterErr);
          }
        });
      }

      const hasPrix = columns.some((column) => column.name === 'prix');
      if (!hasPrix) {
        db.run('ALTER TABLE equipements ADD COLUMN prix REAL', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add prix column to equipements table:', alterErr);
          }
        });
      }

      const hasGarantieAnnees = columns.some((column) => column.name === 'garantie_annees');
      if (!hasGarantieAnnees) {
        db.run('ALTER TABLE equipements ADD COLUMN garantie_annees INTEGER', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add garantie_annees column to equipements table:', alterErr);
          }
        });
      }
    });

    db.all('PRAGMA table_info(employes)', (employesPragmaErr, employeColumns) => {
      if (employesPragmaErr) {
        console.error('Failed to inspect employes table:', employesPragmaErr);
        return;
      }

      const hasTerritoire = employeColumns.some((column) => column.name === 'territoire');
      if (!hasTerritoire) {
        db.run('ALTER TABLE employes ADD COLUMN territoire TEXT NOT NULL DEFAULT "martinique"', (alterErr) => {
          if (alterErr) {
            console.error('Failed to add territoire column to employes table:', alterErr);
          } else {
            db.run('UPDATE employes SET territoire = "martinique" WHERE territoire IS NULL', (updateErr) => {
              if (updateErr) {
                console.error('Failed to seed default territoire for existing employes:', updateErr);
              }
            });
          }
        });
      }
    });
  });
});

module.exports = db;
