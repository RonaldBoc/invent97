const db = require('./db');

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        return reject(err);
      }
      resolve(this);
    });
  });
}

function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function formatTimestamp() {
  return new Date().toISOString();
}

async function listIdentifiantsByEquipement(equipementId) {
  if (!Number.isInteger(Number(equipementId))) {
    return [];
  }
  return getAll(
    `SELECT id, equipement_id, nom, mot_de_passe
     FROM equipement_identifiants
     WHERE equipement_id = ?
     ORDER BY nom COLLATE NOCASE ASC, id ASC`,
    [equipementId]
  );
}

async function replaceIdentifiantsForEquipement(equipementId, identifiants = []) {
  const now = formatTimestamp();
  await runQuery('DELETE FROM equipement_identifiants WHERE equipement_id = ?', [equipementId]);

  if (!Array.isArray(identifiants) || identifiants.length === 0) {
    return;
  }

  for (const identifiant of identifiants) {
    await runQuery(
      `INSERT INTO equipement_identifiants (equipement_id, nom, mot_de_passe, date_creation, date_modification)
       VALUES (?, ?, ?, ?, ?)`,
      [equipementId, identifiant.nom, identifiant.mot_de_passe, now, now]
    );
  }
}

module.exports = {
  listIdentifiantsByEquipement,
  replaceIdentifiantsForEquipement
};
