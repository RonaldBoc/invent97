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

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
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

async function listEmployes() {
  return getAll(
    `SELECT e.*,
      TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom_complet,
      (SELECT COUNT(*) FROM equipements eq WHERE eq.employe_id = e.id) AS equipement_count
     FROM employes e
     ORDER BY e.nom COLLATE NOCASE ASC, e.prenom COLLATE NOCASE ASC`
  );
}

function getEmployeById(id) {
  return get(
    `SELECT e.*,
      TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom_complet,
      (SELECT COUNT(*) FROM equipements eq WHERE eq.employe_id = e.id) AS equipement_count
     FROM employes e WHERE e.id = ?`,
    [id]
  );
}

async function createEmploye(payload) {
  const now = formatTimestamp();
  const { prenom, nom, email, telephone, poste, territoire, commentaire } = payload;

  await runQuery(
    `INSERT INTO employes (prenom, nom, email, telephone, poste, territoire, commentaire, date_creation, date_modification)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    , [
      prenom,
      nom,
      email || null,
      telephone || null,
      poste || null,
      territoire,
      commentaire || null,
      now,
      now
    ]
  );
}

async function updateEmploye(id, payload) {
  const now = formatTimestamp();
  const { prenom, nom, email, telephone, poste, territoire, commentaire } = payload;

  await runQuery(
    `UPDATE employes SET
      prenom = ?,
      nom = ?,
      email = ?,
      telephone = ?,
      poste = ?,
      territoire = ?,
      commentaire = ?,
      date_modification = ?
     WHERE id = ?`,
    [
      prenom,
      nom,
      email || null,
      telephone || null,
      poste || null,
      territoire,
      commentaire || null,
      now,
      id
    ]
  );
}

function deleteEmploye(id) {
  return runQuery('DELETE FROM employes WHERE id = ?', [id]);
}

function detachEmployeFromEquipements(employeId) {
  return runQuery('UPDATE equipements SET employe_id = NULL, employe_attribue = NULL WHERE employe_id = ?', [employeId]);
}

module.exports = {
  listEmployes,
  getEmployeById,
  createEmploye,
  updateEmploye,
  deleteEmploye,
  detachEmployeFromEquipements
};
