const XLSX = require('xlsx');
const db = require('./db');

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

/**
 * Récupère tous les équipements triés par date d'achat
 */
async function getEquipementsForExport() {
  const equipements = await getAll(`
    SELECT 
      equipements.*,
      t.nom AS type_nom,
      e.prenom AS employe_prenom,
      e.nom AS employe_nom,
      e.email AS employe_email,
      e.telephone AS employe_telephone,
      e.poste AS employe_poste,
      e.territoire AS employe_territoire
    FROM equipements
    LEFT JOIN types t ON t.id = equipements.type_id
    LEFT JOIN employes e ON e.id = equipements.employe_id
    ORDER BY COALESCE(equipements.date_achat, '9999-12-31') ASC, equipements.id ASC
  `);
  
  return equipements;
}

/**
 * Récupère tous les employés avec leurs équipements
 */
async function getEmployesWithEquipments() {
  const employes = await getAll(`
    SELECT 
      e.*,
      TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')) AS nom_complet,
      (SELECT COUNT(*) FROM equipements eq WHERE eq.employe_id = e.id) AS equipement_count
    FROM employes e
    ORDER BY e.territoire ASC, e.nom COLLATE NOCASE ASC, e.prenom COLLATE NOCASE ASC
  `);
  
  return employes;
}

/**
 * Récupère les équipements attribués à un employé
 */
async function getEmployeeEquipments(employeeId) {
  return getAll(`
    SELECT 
      equipements.*,
      t.nom AS type_nom
    FROM equipements
    LEFT JOIN types t ON t.id = equipements.type_id
    WHERE equipements.employe_id = ?
    ORDER BY equipements.date_achat ASC, equipements.id ASC
  `, [employeeId]);
}

/**
 * Calcule les statistiques du logiciel
 */
async function getStatistics() {
  const totalCount = await get(`
    SELECT COUNT(*) as count FROM equipements
  `);
  
  const totalValue = await get(`
    SELECT COALESCE(SUM(prix), 0) as total FROM equipements
  `);
  
  const enPanneCount = await get(`
    SELECT COUNT(*) as count FROM equipements WHERE etat = 'En panne'
  `);
  
  const availableCount = await get(`
    SELECT COUNT(*) as count FROM equipements WHERE etat = 'Disponible'
  `);
  
  const inServiceCount = await get(`
    SELECT COUNT(*) as count FROM equipements WHERE etat = 'En service'
  `);
  
  const unavailableCount = await get(`
    SELECT COUNT(*) as count FROM equipements WHERE etat = 'Indisponible'
  `);
  
  const employeeCount = await get(`
    SELECT COUNT(*) as count FROM employes
  `);
  
  const typeCount = await get(`
    SELECT COUNT(*) as count FROM types
  `);
  
  const quantityByTerritoire = await getAll(`
    SELECT 
      e.territoire,
      COUNT(eq.id) as total,
      COALESCE(SUM(eq.prix), 0) as valeur_totale
    FROM employes e
    LEFT JOIN equipements eq ON eq.employe_id = e.id
    GROUP BY e.territoire
    ORDER BY e.territoire ASC
  `);
  
  const valueByType = await getAll(`
    SELECT 
      COALESCE(t.nom, eq.type, 'Non catégorisé') as type,
      COUNT(eq.id) as total,
      COALESCE(SUM(eq.prix), 0) as valeur_totale
    FROM equipements eq
    LEFT JOIN types t ON t.id = eq.type_id
    GROUP BY t.nom, eq.type
    ORDER BY valeur_totale DESC, type ASC
  `);
  
  const valueByMarque = await getAll(`
    SELECT 
      eq.marque,
      COUNT(eq.id) as total,
      COALESCE(SUM(eq.prix), 0) as valeur_totale
    FROM equipements eq
    WHERE eq.marque IS NOT NULL AND eq.marque != ''
    GROUP BY eq.marque
    ORDER BY valeur_totale DESC, eq.marque ASC
  `);
  
  const stateDistribution = await getAll(`
    SELECT 
      etat,
      COUNT(*) as total
    FROM equipements
    GROUP BY etat
    ORDER BY etat ASC
  `);
  
  return {
    totalCount: totalCount?.count || 0,
    totalValue: totalValue?.total || 0,
    enPanneCount: enPanneCount?.count || 0,
    availableCount: availableCount?.count || 0,
    inServiceCount: inServiceCount?.count || 0,
    unavailableCount: unavailableCount?.count || 0,
    employeeCount: employeeCount?.count || 0,
    typeCount: typeCount?.count || 0,
    quantityByTerritoire,
    valueByType,
    valueByMarque,
    stateDistribution
  };
}

/**
 * Prépare les données pour la feuille Équipements (format XLSX)
 */
async function prepareEquipmentsData() {
  const equipements = await getEquipementsForExport();
  
  const headers = [
    'ID',
    'Type',
    'Marque',
    'Modèle',
    'Numéro de série',
    'État',
    'Date d\'achat',
    'Lieu d\'achat',
    'Prix (€)',
    'Garantie (ans)',
    'Employé',
    'Email',
    'Téléphone',
    'Poste',
    'Territoire',
    'Commentaire'
  ];
  
  const data = [headers];
  
  for (const eq of equipements) {
    const employeName = eq.employe_prenom && eq.employe_nom 
      ? `${eq.employe_prenom} ${eq.employe_nom}` 
      : '';
    
    data.push([
      eq.id,
      eq.type_nom || eq.type,
      eq.marque,
      eq.modele,
      eq.numero_serie,
      eq.etat,
      eq.date_achat || '',
      eq.lieu_achat || '',
      eq.prix || '',
      eq.garantie_annees || '',
      employeName,
      eq.employe_email || '',
      eq.employe_telephone || '',
      eq.employe_poste || '',
      eq.employe_territoire || '',
      eq.commentaire || ''
    ]);
  }
  
  return data;
}

/**
 * Prépare les données pour la feuille Employés (format XLSX)
 */
async function prepareEmployeesData() {
  const employes = await getEmployesWithEquipments();
  
  const headers = [
    'Employé',
    'Territoire',
    'Poste',
    'Email',
    'Téléphone',
    'Nombre d\'équipements',
    'Équipements attribués',
    'Commentaire'
  ];
  
  const data = [headers];
  
  for (const emp of employes) {
    const equipments = await getEmployeeEquipments(emp.id);
    
    const equipmentList = equipments
      .map(eq => `${eq.type_nom || eq.type} - ${eq.marque} ${eq.modele}`)
      .join(' | ');
    
    data.push([
      emp.nom_complet,
      emp.territoire || '',
      emp.poste || '',
      emp.email || '',
      emp.telephone || '',
      emp.equipement_count || 0,
      equipmentList,
      emp.commentaire || ''
    ]);
  }
  
  return data;
}

/**
 * Prépare les données pour la feuille Statistiques (format XLSX)
 */
async function prepareStatisticsData() {
  const stats = await getStatistics();
  
  const data = [];
  
  // Résumé général
  data.push(['RÉSUMÉ GÉNÉRAL']);
  data.push(['Métrique', 'Valeur']);
  data.push(['Total d\'équipements', stats.totalCount]);
  data.push(['Valeur totale (€)', stats.totalValue]);
  
  if (stats.totalCount > 0) {
    const avgValue = stats.totalValue / stats.totalCount;
    data.push(['Valeur moyenne par équipement (€)', avgValue.toFixed(2)]);
  }
  
  data.push(['Nombre d\'employés', stats.employeeCount]);
  data.push(['Nombre de types de matériel', stats.typeCount]);
  data.push([]);
  
  // Distribution par état
  data.push(['DISTRIBUTION PAR ÉTAT']);
  data.push(['État', 'Quantité']);
  data.push(['En service', stats.inServiceCount]);
  data.push(['Disponible', stats.availableCount]);
  data.push(['En panne', stats.enPanneCount]);
  data.push(['Indisponible', stats.unavailableCount]);
  data.push([]);
  
  // Répartition par territoire
  if (stats.quantityByTerritoire && stats.quantityByTerritoire.length > 0) {
    data.push(['RÉPARTITION PAR TERRITOIRE']);
    data.push(['Territoire', 'Quantité', 'Valeur estimée (€)']);
    
    for (const row of stats.quantityByTerritoire) {
      data.push([
        row.territoire || 'Non attribué',
        row.total,
        row.valeur_totale || 0
      ]);
    }
    data.push([]);
  }
  
  // Valeur par type
  if (stats.valueByType && stats.valueByType.length > 0) {
    data.push(['VALEUR PAR TYPE DE MATÉRIEL']);
    data.push(['Type', 'Quantité', 'Valeur estimée (€)']);
    
    for (const row of stats.valueByType) {
      data.push([
        row.type,
        row.total,
        row.valeur_totale || 0
      ]);
    }
    data.push([]);
  }
  
  // Valeur par marque
  if (stats.valueByMarque && stats.valueByMarque.length > 0) {
    data.push(['VALEUR PAR MARQUE']);
    data.push(['Marque', 'Quantité', 'Valeur estimée (€)']);
    
    for (const row of stats.valueByMarque) {
      data.push([
        row.marque,
        row.total,
        row.valeur_totale || 0
      ]);
    }
  }
  
  return data;
}

/**
 * Génère un fichier XLSX avec 3 feuilles
 */
async function generateExcelFile() {
  const equipementsData = await prepareEquipmentsData();
  const employeesData = await prepareEmployeesData();
  const statisticsData = await prepareStatisticsData();
  
  // Créer les feuilles de travail
  const ws1 = XLSX.utils.aoa_to_sheet(equipementsData);
  const ws2 = XLSX.utils.aoa_to_sheet(employeesData);
  const ws3 = XLSX.utils.aoa_to_sheet(statisticsData);
  
  // Ajuster les largeurs de colonne pour la lisibilité
  const maxWidth = 20;
  
  // Pour les équipements
  ws1['!cols'] = equipementsData[0].map(() => ({ wch: maxWidth }));
  
  // Pour les employés
  ws2['!cols'] = employeesData[0].map(() => ({ wch: maxWidth }));
  
  // Pour les statistiques
  ws3['!cols'] = statisticsData[0].map(() => ({ wch: maxWidth }));
  
  // Créer le classeur avec les 3 feuilles
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws1, 'Équipements');
  XLSX.utils.book_append_sheet(workbook, ws2, 'Employés');
  XLSX.utils.book_append_sheet(workbook, ws3, 'Statistiques');
  
  // Retourner le classeur (sera converti en buffer par les routes)
  return workbook;
}

/**
 * Génère un fichier XLSX pour les équipements uniquement
 */
async function generateEquipmentsExcel() {
  const data = await prepareEquipmentsData();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(() => ({ wch: 20 }));
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, 'Équipements');
  
  return workbook;
}

/**
 * Génère un fichier XLSX pour les employés uniquement
 */
async function generateEmployeesExcel() {
  const data = await prepareEmployeesData();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(() => ({ wch: 20 }));
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, 'Employés');
  
  return workbook;
}

/**
 * Génère un fichier XLSX pour les statistiques uniquement
 */
async function generateStatisticsExcel() {
  const data = await prepareStatisticsData();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map(() => ({ wch: 20 }));
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, 'Statistiques');
  
  return workbook;
}

module.exports = {
  generateExcelFile,
  generateEquipmentsExcel,
  generateEmployeesExcel,
  generateStatisticsExcel,
  prepareEquipmentsData,
  prepareEmployeesData,
  prepareStatisticsData
};
