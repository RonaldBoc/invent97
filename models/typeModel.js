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

async function listTypes() {
  return getAll(
    `SELECT t.*,
      (SELECT COUNT(*) FROM equipements e WHERE e.type_id = t.id) AS equipement_count
     FROM types t
     ORDER BY t.nom COLLATE NOCASE ASC`
  );
}

function getTypeById(id) {
  return get(
    `SELECT t.*,
      (SELECT COUNT(*) FROM equipements e WHERE e.type_id = t.id) AS equipement_count
     FROM types t
     WHERE t.id = ?`,
    [id]
  );
}

async function createType(payload) {
  const { nom, description } = payload;
  await runQuery(
    `INSERT INTO types (nom, description, date_creation, date_modification)
     VALUES (?, ?, ?, ?)` ,
    [nom, description || null, nowIso(), nowIso()]
  );
}

async function updateType(id, payload) {
  const { nom, description } = payload;
  await runQuery(
    `UPDATE types SET nom = ?, description = ?, date_modification = ? WHERE id = ?`,
    [nom, description || null, nowIso(), id]
  );
}

function deleteType(id) {
  return runQuery('DELETE FROM types WHERE id = ?', [id]);
}

function detachTypeFromEquipements(typeId) {
  return runQuery('UPDATE equipements SET type_id = NULL WHERE type_id = ?', [typeId]);
}

module.exports = {
  listTypes,
  getTypeById,
  createType,
  updateType,
  deleteType,
  detachTypeFromEquipements
};
