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

const employeeNameExpr = "TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''))";
const typeNameExpr = "COALESCE(t.nom, equipements.type)";

const baseSelect = `
  SELECT equipements.*,
    t.nom AS type_nom,
    t.description AS type_description,
    e.prenom AS employe_prenom,
    e.nom AS employe_nom,
    e.email AS employe_email,
    e.telephone AS employe_telephone,
    e.poste AS employe_poste,
    e.territoire AS employe_territoire,
    ${employeeNameExpr} AS employe_nom_complet,
    ${typeNameExpr} AS type_nom_final
  FROM equipements
  LEFT JOIN employes e ON e.id = equipements.employe_id
  LEFT JOIN types t ON t.id = equipements.type_id
`;

async function getAllEquipements(filters = {}) {
  const clauses = [];
  const params = [];
  const searchTerm = typeof filters.search === 'string' ? filters.search.trim() : '';
  const etatFilter = typeof filters.etat === 'string' ? filters.etat : 'tous';
  const typeFilter = typeof filters.type === 'string' ? filters.type.trim() : 'tous';
  const employeFilter = typeof filters.employe === 'string' ? filters.employe.trim() : 'tous';
  const anneeFilter = typeof filters.annee === 'string' ? filters.annee.trim() : 'toutes';
  const marqueFilter = typeof filters.marque === 'string' ? filters.marque.trim() : 'toutes';

  if (searchTerm) {
    const likeQuery = `%${searchTerm}%`;
    clauses.push(
      `(
  equipements.type LIKE ? OR
  t.nom LIKE ? OR
        equipements.marque LIKE ? OR
        equipements.modele LIKE ? OR
        equipements.numero_serie LIKE ? OR
        equipements.lieu_achat LIKE ? OR
        equipements.commentaire LIKE ? OR
        e.prenom LIKE ? OR
        e.nom LIKE ? OR
        ${employeeNameExpr} LIKE ? OR
        e.territoire LIKE ?
      )`
    );
  params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
  }

  if (etatFilter && etatFilter !== 'tous') {
    clauses.push('equipements.etat = ?');
    params.push(etatFilter);
  }

  if (typeFilter && typeFilter !== 'tous') {
    clauses.push(`${typeNameExpr} = ?`);
    params.push(typeFilter);
  }

  if (employeFilter && employeFilter !== 'tous') {
    const employeId = Number(employeFilter);
    if (Number.isInteger(employeId)) {
      clauses.push('equipements.employe_id = ?');
      params.push(employeId);
    } else {
      clauses.push('1 = 0');
    }
  }

  if (anneeFilter && anneeFilter !== 'toutes') {
    clauses.push("strftime('%Y', equipements.date_achat) = ?");
    params.push(anneeFilter);
  }

  if (marqueFilter && marqueFilter !== 'toutes') {
    clauses.push('equipements.marque = ?');
    params.push(marqueFilter);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `${baseSelect} ${where} ORDER BY
    CASE WHEN equipements.date_achat IS NULL OR equipements.date_achat = '' THEN 1 ELSE 0 END,
    equipements.date_achat DESC,
    equipements.date_creation DESC`;
  return getAll(sql, params);
}

function getEquipementById(id) {
  return get(
    `${baseSelect} WHERE equipements.id = ?`,
    [id]
  );
}

function listEquipementsByEmploye(employeId) {
  if (!Number.isInteger(Number(employeId))) {
    return Promise.resolve([]);
  }

  const sql = `${baseSelect} WHERE equipements.employe_id = ?
    ORDER BY
      CASE WHEN equipements.date_achat IS NULL OR equipements.date_achat = '' THEN 1 ELSE 0 END,
      equipements.date_achat DESC,
      equipements.date_creation DESC`;
  return getAll(sql, [Number(employeId)]);
}

async function createEquipement(payload) {
  const nowIso = new Date().toISOString();
  const {
    type,
    type_id,
    marque,
    modele,
    numero_serie,
    etat,
    date_achat,
    lieu_achat,
    prix,
    garantie_annees,
    employe_id,
    employe_attribue,
    commentaire,
    fichier_facture
  } = payload;

  const insertResult = await runQuery(
    `INSERT INTO equipements (
      type, type_id, marque, modele, numero_serie, etat, date_achat, lieu_achat, prix, garantie_annees, employe_id, employe_attribue, commentaire, fichier_facture, date_creation, date_modification
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      type,
      type_id || null,
      marque,
      modele,
      numero_serie || null,
      etat,
      date_achat || null,
      lieu_achat || null,
      typeof prix === 'number' ? prix : null,
      Number.isInteger(garantie_annees) ? garantie_annees : null,
      employe_id || null,
      employe_attribue || null,
      commentaire || null,
      fichier_facture || null,
      nowIso,
      nowIso
    ]
  );

  return insertResult?.lastID;
}

async function updateEquipement(id, payload) {
  const nowIso = new Date().toISOString();
  const {
    type,
    type_id,
    marque,
    modele,
    numero_serie,
    etat,
    date_achat,
    lieu_achat,
    prix,
    garantie_annees,
    employe_id,
    employe_attribue,
    commentaire,
    fichier_facture
  } = payload;

  await runQuery(
    `UPDATE equipements SET
      type = ?,
      type_id = ?,
      marque = ?,
      modele = ?,
      numero_serie = ?,
      etat = ?,
      date_achat = ?,
      lieu_achat = ?,
      prix = ?,
      garantie_annees = ?,
      employe_id = ?,
      employe_attribue = ?,
      commentaire = ?,
      fichier_facture = ?,
      date_modification = ?
     WHERE id = ?`,
    [
      type,
      type_id || null,
      marque,
      modele,
  numero_serie || null,
      etat,
      date_achat || null,
      lieu_achat || null,
      typeof prix === 'number' ? prix : null,
      Number.isInteger(garantie_annees) ? garantie_annees : null,
      employe_id || null,
      employe_attribue || null,
      commentaire || null,
      fichier_facture || null,
      nowIso,
      id
    ]
  );
}

function deleteEquipement(id) {
  return runQuery('DELETE FROM equipements WHERE id = ?', [id]);
}

async function getSummary() {
  const total = await get('SELECT COUNT(*) AS total FROM equipements');
  const enPanne = await get("SELECT COUNT(*) AS count FROM equipements WHERE etat = 'En panne'");
  const parCategorie = await getAll(
    `SELECT ${typeNameExpr} AS categorie, COUNT(*) AS count
     FROM equipements
     LEFT JOIN types t ON t.id = equipements.type_id
     GROUP BY categorie
     ORDER BY categorie`
  );

  return {
    total: total?.total || 0,
    enPanne: enPanne?.count || 0,
    parCategorie
  };
}

async function exportEquipements() {
  return getAll(
    `${baseSelect} ORDER BY equipements.id ASC`
  );
}

async function getEquipementFilterOptions() {
  const [typeRows, marqueRows, anneeRows, employeRows] = await Promise.all([
    getAll(
      `SELECT DISTINCT ${typeNameExpr} AS type_label
       FROM equipements
       LEFT JOIN types t ON t.id = equipements.type_id
       WHERE ${typeNameExpr} IS NOT NULL AND TRIM(${typeNameExpr}) <> ''
       ORDER BY type_label COLLATE NOCASE`
    ),
    getAll(
      `SELECT DISTINCT marque
       FROM equipements
       WHERE marque IS NOT NULL AND TRIM(marque) <> ''
       ORDER BY marque COLLATE NOCASE`
    ),
    getAll(
      `SELECT DISTINCT strftime('%Y', date_achat) AS annee
       FROM equipements
       WHERE date_achat IS NOT NULL AND TRIM(date_achat) <> ''
       ORDER BY annee DESC`
    ),
    getAll(
      `SELECT e.id,
        TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom_complet
       FROM employes e
       WHERE EXISTS (SELECT 1 FROM equipements eq WHERE eq.employe_id = e.id)
       ORDER BY nom_complet COLLATE NOCASE`
    )
  ]);

  return {
    types: typeRows.map((row) => row.type_label),
    marques: marqueRows.map((row) => row.marque),
    annees: anneeRows
      .map((row) => row.annee)
      .filter((value) => typeof value === 'string' && value.trim().length > 0),
    employes: employeRows.map((row) => {
      const label = typeof row.nom_complet === 'string' ? row.nom_complet.trim() : '';
      return {
        id: row.id,
        nom_complet: label.length ? label : `Employé #${row.id}`
      };
    })
  };
}

async function getInventoryStats() {
  const [overviewRow, enPanneRow, territoryRows, typeRows, brandRows, vendorRows] = await Promise.all([
    get(
      `SELECT
        COUNT(*) AS total_count,
        SUM(COALESCE(prix, 0)) AS total_value
       FROM equipements`
    ),
    get(
      `SELECT COUNT(*) AS en_panne
       FROM equipements
       WHERE etat = 'En panne'`
    ),
    getAll(
      `SELECT
        CASE
          WHEN e.territoire IS NULL OR TRIM(e.territoire) = '' THEN 'non_attribue'
          ELSE LOWER(e.territoire)
        END AS territoire_key,
        COUNT(eq.id) AS total,
        SUM(COALESCE(eq.prix, 0)) AS valeur_totale
       FROM equipements eq
       LEFT JOIN employes e ON e.id = eq.employe_id
       GROUP BY territoire_key`
    ),
    getAll(
      `SELECT ${typeNameExpr} AS type_nom,
        COUNT(equipements.id) AS total,
        SUM(COALESCE(prix, 0)) AS valeur_totale
       FROM equipements
       LEFT JOIN types t ON t.id = equipements.type_id
       GROUP BY ${typeNameExpr}
       ORDER BY type_nom COLLATE NOCASE`
    ),
    getAll(
      `SELECT marque,
        COUNT(*) AS total,
        SUM(COALESCE(prix, 0)) AS valeur_totale
       FROM equipements
       WHERE marque IS NOT NULL AND TRIM(marque) <> ''
       GROUP BY marque
       ORDER BY marque COLLATE NOCASE`
    ),
    getAll(
      `SELECT lieu_achat AS fournisseur,
        COUNT(*) AS total,
        SUM(COALESCE(prix, 0)) AS valeur_totale
       FROM equipements
       WHERE lieu_achat IS NOT NULL AND TRIM(lieu_achat) <> ''
       GROUP BY lieu_achat
       ORDER BY fournisseur COLLATE NOCASE`
    )
  ]);

  const territorySummary = territoryRows.reduce((acc, row) => {
    const key = typeof row.territoire_key === 'string' && row.territoire_key.trim().length
      ? row.territoire_key.trim().toLowerCase()
      : 'non_attribue';
    acc[key] = {
      total: Number(row.total) || 0,
      valeur_totale: Number(row.valeur_totale) || 0
    };
    return acc;
  }, {});

  const orderedTerritories = ['martinique', 'guadeloupe'];
  const quantityByTerritoire = orderedTerritories.map((territoire) => ({
    territoire,
    total: territorySummary[territoire]?.total || 0,
    valeur_totale: territorySummary[territoire]?.valeur_totale || 0
  }));

  if (territorySummary.non_attribue) {
    quantityByTerritoire.push({
      territoire: 'non_attribue',
      total: territorySummary.non_attribue.total,
      valeur_totale: territorySummary.non_attribue.valeur_totale
    });
  }

  return {
    totalCount: Number(overviewRow?.total_count) || 0,
    enPanneCount: Number(enPanneRow?.en_panne) || 0,
    totalValue: Number(overviewRow?.total_value) || 0,
    quantityByTerritoire,
    valueByType: typeRows.map((row) => ({
      type: typeof row.type_nom === 'string' ? row.type_nom.trim() : row.type_nom,
      total: Number(row.total) || 0,
      valeur_totale: Number(row.valeur_totale) || 0
    })),
    valueByMarque: brandRows.map((row) => ({
      marque: typeof row.marque === 'string' ? row.marque.trim() : row.marque,
      total: Number(row.total) || 0,
      valeur_totale: Number(row.valeur_totale) || 0
    })),
    valueByFournisseur: vendorRows.map((row) => ({
      fournisseur: typeof row.fournisseur === 'string' ? row.fournisseur.trim() : row.fournisseur,
      total: Number(row.total) || 0,
      valeur_totale: Number(row.valeur_totale) || 0
    }))
  };
}

module.exports = {
  getAllEquipements,
  getEquipementById,
  createEquipement,
  updateEquipement,
  deleteEquipement,
  getSummary,
  exportEquipements,
  getEquipementFilterOptions,
  listEquipementsByEmploye,
  getInventoryStats
};
