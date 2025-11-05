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

function nowIso() {
  return new Date().toISOString();
}

function listEvenementsByEquipement(equipementId) {
  return getAll(
    `SELECT ev.*, 
      emp.prenom AS nouvel_employe_prenom,
      emp.nom AS nouvel_employe_nom,
      emp.poste AS nouvel_employe_poste,
      emp.territoire AS nouvel_employe_territoire,
      TRIM(COALESCE(emp.prenom, '') || ' ' || COALESCE(emp.nom, '')) AS nouvel_employe_nom_complet
     FROM evenements ev
     LEFT JOIN employes emp ON emp.id = ev.nouvel_employe_id
     WHERE ev.equipement_id = ?
     ORDER BY ev.date_evenement DESC, ev.date_creation DESC`,
    [equipementId]
  );
}

function getEvenementById(id) {
  return get(
    `SELECT ev.*, 
      emp.prenom AS nouvel_employe_prenom,
      emp.nom AS nouvel_employe_nom,
      emp.poste AS nouvel_employe_poste,
      emp.territoire AS nouvel_employe_territoire,
      TRIM(COALESCE(emp.prenom, '') || ' ' || COALESCE(emp.nom, '')) AS nouvel_employe_nom_complet
     FROM evenements ev
     LEFT JOIN employes emp ON emp.id = ev.nouvel_employe_id
     WHERE ev.id = ?`,
    [id]
  );
}

async function createEvenement(payload) {
  const now = nowIso();
  const { equipement_id, categorie, description, date_evenement, document, nouvel_employe_id, nouvel_etat } = payload;

  await runQuery(
    `INSERT INTO evenements (
      equipement_id,
      categorie,
      description,
      date_evenement,
      document,
      nouvel_employe_id,
      nouvel_etat,
      date_creation,
      date_modification
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      equipement_id,
      categorie,
      description || null,
      date_evenement,
      document || null,
      nouvel_employe_id || null,
      nouvel_etat || null,
      now,
      now
    ]
  );
}

async function updateEvenement(id, payload) {
  const now = nowIso();
  const { categorie, description, date_evenement, document, nouvel_employe_id, nouvel_etat } = payload;

  await runQuery(
    `UPDATE evenements SET
      categorie = ?,
      description = ?,
      date_evenement = ?,
      document = ?,
      nouvel_employe_id = ?,
      nouvel_etat = ?,
      date_modification = ?
     WHERE id = ?`,
    [
      categorie,
      description || null,
      date_evenement,
      document || null,
      nouvel_employe_id || null,
      nouvel_etat || null,
      now,
      id
    ]
  );
}

function deleteEvenement(id) {
  return runQuery('DELETE FROM evenements WHERE id = ?', [id]);
}

module.exports = {
  listEvenementsByEquipement,
  getEvenementById,
  createEvenement,
  updateEvenement,
  deleteEvenement
};
