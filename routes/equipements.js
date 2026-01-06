const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const {
  getAllEquipements,
  getEquipementById,
  createEquipement,
  updateEquipement,
  deleteEquipement,
  getSummary,
  exportEquipements,
  getEquipementFilterOptions,
  getInventoryStats
} = require('../models/equipementModel');
const { listEmployes, getEmployeById } = require('../models/employeModel');
const { listTypes, getTypeById } = require('../models/typeModel');
const {
  listEvenementsByEquipement,
  getEvenementById,
  createEvenement,
  updateEvenement,
  deleteEvenement
} = require('../models/evenementModel');
const {
  listIdentifiantsByEquipement,
  replaceIdentifiantsForEquipement
} = require('../models/identifiantModel');
const stateBadgeTheme = require('../constants/stateBadgeTheme');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
const allowedStates = ['En service', 'Disponible', 'En panne', 'Indisponible'];
const defaultEventCategories = ['Attribution', 'État', 'Observation'];

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté.'));
    }
  }
});

function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          req.fileUploadError = 'Le fichier dépasse la taille maximale autorisée (5 Mo).';
          return next();
        }
        if (err.message === 'Format de fichier non supporté.') {
          req.fileUploadError = err.message;
          return next();
        }
        return next(err);
      }
      next();
    });
  };
}

function deleteUploadedFile(fileName) {
  if (!fileName) {
    return;
  }
          stateBadgeTheme,
          stateBadgeTheme,
  fs.unlink(path.join(uploadDir, fileName), () => {});
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function buildEquipementUpdatePayload(equipement, overrides = {}) {
  return {
    type: equipement.type,
    type_id: equipement.type_id,
    marque: equipement.marque,
    modele: equipement.modele,
    numero_serie: equipement.numero_serie,
    etat: equipement.etat,
    date_achat: equipement.date_achat,
    lieu_achat: equipement.lieu_achat,
    prix: equipement.prix,
    garantie_annees: equipement.garantie_annees,
    fichier_facture: equipement.fichier_facture,
    employe_id: equipement.employe_id,
    employe_attribue: equipement.employe_attribue,
    commentaire: equipement.commentaire,
    ...overrides
  };
}

function sanitizeDate(input) {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizePriceInput(input) {
  const trimmed = sanitizeText(input);
  if (!trimmed) {
    return { value: null, error: null };
  }
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: 'Le prix doit être un nombre positif ou nul.' };
  }
  return { value: parsed, error: null };
}

function normalizeWarrantyInput(input) {
  const trimmed = sanitizeText(input);
  if (!trimmed) {
    return { value: null, error: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: null, error: 'La durée de garantie doit être un entier positif ou nul.' };
  }
  return { value: parsed, error: null };
}

function extractIdentifiantsFromBody(body) {
  const ensureArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'undefined' || value === null) return [];
    return [value];
  };

  const namesRaw = ensureArray(body.identifiants_nom ?? body['identifiants_nom[]']);
  const passwordsRaw = ensureArray(body.identifiants_mot_de_passe ?? body['identifiants_mot_de_passe[]']);
  const maxLength = Math.max(namesRaw.length, passwordsRaw.length);
  const entries = [];
  const errors = [];

  for (let index = 0; index < maxLength; index += 1) {
    const nom = sanitizeText(namesRaw[index] || '');
    const motDePasse = sanitizeText(passwordsRaw[index] || '');

    if (!nom && !motDePasse) {
      continue;
    }

    if (!nom || !motDePasse) {
      errors.push('Chaque identifiant doit inclure un nom de session et un mot de passe.');
      continue;
    }

    entries.push({ nom, mot_de_passe: motDePasse });
  }

  return { entries, errors };
}

function validateEquipement(body, options = {}) {
  const errors = [];
  const { type_id, marque, modele, numero_serie, etat } = body;
  const parsedPrice = options.parsedPrice ?? normalizePriceInput(body.prix);
  const parsedWarranty = options.parsedWarranty ?? normalizeWarrantyInput(body.garantie_annees);

  if (!type_id) {
    errors.push('Le type de matériel est requis.');
  }
  if (!marque) errors.push('Le champ marque est requis.');
  if (!modele) errors.push('Le champ modèle est requis.');
  if (!etat) {
    errors.push('Le champ état est requis.');
  } else if (!allowedStates.includes(etat)) {
    errors.push('L\'état sélectionné est invalide.');
  }

  if (parsedPrice.error) {
    errors.push(parsedPrice.error);
  }

  if (parsedWarranty.error) {
    errors.push(parsedWarranty.error);
  }

  return errors;
}

function sanitizeEvenement(body) {
  return {
    categorie: sanitizeText(body.categorie),
    description: sanitizeText(body.description),
    date_evenement: sanitizeDate(body.date_evenement),
    attribution_employe_id: sanitizeText(body.attribution_employe_id),
    nouvel_etat: sanitizeText(body.nouvel_etat)
  };
}

function validateEvenement(payload) {
  const errors = [];

  if (!payload.categorie) {
    errors.push("Le type d'événement est requis.");
  } else if (!defaultEventCategories.includes(payload.categorie)) {
    errors.push("Le type d'événement est invalide.");
  }

  if (!payload.date_evenement) {
    errors.push("La date de l'événement est requise.");
  }

  if (payload.categorie === 'Attribution') {
    if (!payload.attribution_employe_id || !isPositiveInteger(payload.attribution_employe_id)) {
      errors.push("Sélectionnez un employé à attribuer.");
    }
  }

  if (payload.categorie === 'État') {
    if (!payload.nouvel_etat || !allowedStates.includes(payload.nouvel_etat)) {
      errors.push("Sélectionnez un état valide.");
    }
  }

  if (payload.categorie === 'Observation') {
    if (!payload.description) {
      errors.push("Ajoutez un commentaire pour l'observation.");
    }
  }

  return errors;
}

function resolveDetailSuccessMessage(code) {
  switch (code) {
    case 'eventCreated':
      return 'Événement ajouté avec succès.';
    case 'eventUpdated':
      return 'Événement mis à jour avec succès.';
    case 'eventDeleted':
      return 'Événement supprimé.';
    case 'equipementUpdated':
      return "Équipement mis à jour avec succès.";
    default:
      return null;
  }
}

async function buildEquipementDetailViewModel(equipementId, options = {}) {
  const [equipement, employes, types, events, identifiants] = await Promise.all([
    getEquipementById(equipementId),
    listEmployes(),
    listTypes(),
    listEvenementsByEquipement(equipementId),
    listIdentifiantsByEquipement(equipementId)
  ]);

  if (!equipement) {
    return null;
  }

  const equipementWithIdentifiants = {
    ...equipement,
    identifiants
  };

  const equipementFormValues = options.equipementFormData
    ? {
        ...equipementWithIdentifiants,
        ...options.equipementFormData,
        identifiants: Array.isArray(options.equipementFormData.identifiants)
          ? options.equipementFormData.identifiants
          : identifiants
      }
    : { ...equipementWithIdentifiants };
  const eventFormMode = options.eventFormMode || 'create';
  const defaultDate = new Date().toISOString().split('T')[0];
  const defaultEventData = {
    categorie: defaultEventCategories[0],
    date_evenement: defaultDate,
    description: '',
    attribution_employe_id: '',
    nouvel_etat: equipement.etat || allowedStates[0]
  };
  const eventFormData = {
    ...defaultEventData,
    ...(options.eventFormData || {})
  };
  const availableEmployes = Array.isArray(employes) ? [...employes] : [];

  return {
  equipement: equipementWithIdentifiants,
    equipementFormValues,
  identifiants,
    employes,
    types,
    states: allowedStates,
    stateBadgeTheme,
    events,
    eventFormMode,
    eventFormData,
    eventErrors: options.eventErrors || [],
    equipementErrors: options.equipementErrors || [],
    successMessage: options.successMessage || null,
    errorMessage: options.errorMessage || null,
    eventCategories: defaultEventCategories,
    availableEmployes
  };
}

router.get('/', async (req, res) => {
  const searchValue = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const etatQuery = typeof req.query.etat === 'string' ? req.query.etat.trim() : 'tous';
  const etatValue = etatQuery === 'tous' || allowedStates.includes(etatQuery) ? etatQuery : 'tous';
  const typeValue = (() => {
    if (typeof req.query.type !== 'string') return 'tous';
    const trimmed = req.query.type.trim();
    return trimmed.length ? trimmed : 'tous';
  })();
  const employeValue = (() => {
    if (typeof req.query.employe !== 'string') return 'tous';
    const trimmed = req.query.employe.trim();
    if (!trimmed) return 'tous';
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? String(parsed) : 'tous';
  })();
  const anneeValue = (() => {
    if (typeof req.query.annee !== 'string') return 'toutes';
    const trimmed = req.query.annee.trim();
    return /^\d{4}$/.test(trimmed) ? trimmed : 'toutes';
  })();
  const marqueValue = (() => {
    if (typeof req.query.marque !== 'string') return 'toutes';
    const trimmed = req.query.marque.trim();
    return trimmed.length ? trimmed : 'toutes';
  })();

  try {
    const [equipements, summary, filterOptions] = await Promise.all([
      getAllEquipements({
        search: searchValue,
        etat: etatValue,
        type: typeValue,
        employe: employeValue,
        annee: anneeValue,
        marque: marqueValue
      }),
      getSummary(),
      getEquipementFilterOptions()
    ]);

    res.render('index', {
      equipements,
      summary,
      filters: {
        search: searchValue,
        etat: etatValue,
        type: typeValue,
        employe: employeValue,
        annee: anneeValue,
        marque: marqueValue
      },
      states: allowedStates,
      filterOptions,
      stateBadgeTheme
    });
  } catch (err) {
    console.error('Failed to load equipment list:', err);
    res.status(500).render('error', { message: 'Impossible de récupérer les équipements.' });
  }
});

router.get('/statistiques', async (_req, res) => {
  try {
    const [summary, stats] = await Promise.all([getSummary(), getInventoryStats()]);
    res.render('statistiques/index', {
      summary,
      stats
    });
  } catch (err) {
    console.error('Failed to load statistics:', err);
    res.status(500).render('error', { message: 'Impossible de récupérer les statistiques.' });
  }
});

router.get('/ajouter', async (req, res) => {
  try {
    const [employes, types] = await Promise.all([listEmployes(), listTypes()]);
    res.render('form', {
      mode: 'create',
      equipement: {
        etat: allowedStates[0],
        employe_id: '',
        type_id: '',
        lieu_achat: '',
        prix: '',
        garantie_annees: '',
        identifiants: []
      },
      errors: [],
      states: allowedStates,
      employes,
      types,
      identifiants: []
    });
  } catch (err) {
    console.error('Failed to load employees/types for creation:', err);
    res.status(500).render('error', { message: 'Impossible de charger les données nécessaires.' });
  }
});

router.get('/equipements/:id', async (req, res) => {
  const { id } = req.params;
  if (!isPositiveInteger(id)) {
    return res.redirect('/');
  }

  try {
    let eventFormMode = 'create';
    let eventFormData;

    const editEventId = req.query.editEvenement;
    if (editEventId && isPositiveInteger(editEventId)) {
      const eventToEdit = await getEvenementById(Number(editEventId));
      if (eventToEdit && Number(eventToEdit.equipement_id) === Number(id)) {
        eventFormMode = 'edit';
        eventFormData = {
          id: eventToEdit.id,
          categorie: eventToEdit.categorie,
          date_evenement: sanitizeDate(eventToEdit.date_evenement) || eventToEdit.date_evenement,
          description: eventToEdit.description || '',
          attribution_employe_id: eventToEdit.nouvel_employe_id ? String(eventToEdit.nouvel_employe_id) : '',
          nouvel_etat: eventToEdit.nouvel_etat || '',
          document: eventToEdit.document || null
        };
      }
    }

    const viewModel = await buildEquipementDetailViewModel(id, {
      eventFormMode,
      eventFormData,
      successMessage: resolveDetailSuccessMessage(req.query.success),
      errorMessage: req.query.error || null
    });

    if (!viewModel) {
      return res.redirect('/');
    }

    res.render('equipements/show', viewModel);
  } catch (err) {
    console.error('Failed to load equipment detail:', err);
    res.status(500).render('error', { message: 'Impossible de charger cet équipement.' });
  }
});

router.post('/ajouter', handleUpload('fichier_facture'), async (req, res) => {
  const identifiantsResult = extractIdentifiantsFromBody(req.body);
  const identifiants = identifiantsResult.entries;
  const parsedPrice = normalizePriceInput(req.body.prix);
  const parsedWarranty = normalizeWarrantyInput(req.body.garantie_annees);
  let errors = [...validateEquipement(req.body, { parsedPrice, parsedWarranty }), ...identifiantsResult.errors];
  if (req.fileUploadError) {
    errors.push(req.fileUploadError);
  }
  const fileName = req.file ? req.file.filename : null;

  let employe = null;
  let typeRecord = null;
  let employes = [];
  let types = [];

  try {
    [employes, types] = await Promise.all([listEmployes(), listTypes()]);
    const employeIdInputRaw = req.body.employe_id;
    if (employeIdInputRaw) {
      const employeIdParsed = Number(employeIdInputRaw);
      if (!Number.isInteger(employeIdParsed) || employeIdParsed <= 0) {
        errors.push("L'employé sélectionné est introuvable.");
      } else {
        employe = await getEmployeById(employeIdParsed);
        if (!employe) {
          errors.push("L'employé sélectionné est introuvable.");
        }
      }
    }

    const typeIdInputRaw = req.body.type_id;
    if (typeIdInputRaw) {
      const typeIdParsed = Number(typeIdInputRaw);
      if (!Number.isInteger(typeIdParsed) || typeIdParsed <= 0) {
        errors.push('Le type sélectionné est introuvable.');
      } else {
        typeRecord = await getTypeById(typeIdParsed);
        if (!typeRecord) {
          errors.push('Le type sélectionné est introuvable.');
        }
      }
    }
  } catch (err) {
    console.error('Failed to validate references for equipment creation:', err);
    errors.push('Impossible de vérifier les données de référence.');
  }

  if (errors.length) {
    deleteUploadedFile(fileName);

    return res.status(400).render('form', {
      mode: 'create',
      equipement: { ...req.body, identifiants },
      identifiants,
      errors,
      states: allowedStates,
      employes,
      types
    });
  }

  try {
    const typeName = typeRecord ? typeRecord.nom : req.body.type;
    const typeIdValue = typeRecord ? typeRecord.id : req.body.type_id;
    const newEquipementId = await createEquipement({
  type: typeName,
  type_id: typeIdValue,
      marque: req.body.marque,
      modele: req.body.modele,
      numero_serie: req.body.numero_serie,
      etat: req.body.etat,
      date_achat: sanitizeDate(req.body.date_achat),
      lieu_achat: sanitizeText(req.body.lieu_achat) || null,
      prix: parsedPrice.value,
      garantie_annees: parsedWarranty.value,
      fichier_facture: fileName,
      employe_id: employe ? employe.id : null,
      employe_attribue: employe ? employe.nom_complet : null,
      commentaire: req.body.commentaire
    });
    await replaceIdentifiantsForEquipement(newEquipementId, identifiants);
    res.redirect('/');
  } catch (err) {
    console.error('Failed to create equipment:', err);
    deleteUploadedFile(fileName);
    res.status(500).render('form', {
      mode: 'create',
      equipement: { ...req.body, identifiants },
      identifiants,
      errors: ['Impossible d\'enregistrer cet équipement.'],
      states: allowedStates,
      employes,
      types
    });
  }
});

router.get('/modifier/:id', async (req, res) => {
  try {
    const redirect = req.query.redirect === 'detail' ? 'detail' : null;
    const [equipement, employes, types, identifiants] = await Promise.all([
      getEquipementById(req.params.id),
      listEmployes(),
      listTypes(),
      listIdentifiantsByEquipement(req.params.id)
    ]);
    if (!equipement) {
      return res.redirect('/');
    }

    const equipementWithIdentifiants = {
      ...equipement,
      identifiants
    };

    res.render('form', {
      mode: 'edit',
      equipement: equipementWithIdentifiants,
      errors: [],
      states: allowedStates,
      employes,
      types,
      identifiants,
      redirect
    });
  } catch (err) {
    console.error('Failed to load equipment:', err);
    res.status(500).render('error', { message: 'Impossible de charger cet équipement.' });
  }
});

router.post('/modifier/:id', handleUpload('fichier_facture'), async (req, res) => {
  const { id } = req.params;
  const redirectToDetail = req.query.redirect === 'detail' || req.body.redirect === 'detail';
  const identifiantsResult = extractIdentifiantsFromBody(req.body);
  const identifiants = identifiantsResult.entries;
  const parsedPrice = normalizePriceInput(req.body.prix);
  const parsedWarranty = normalizeWarrantyInput(req.body.garantie_annees);
  let errors = [...validateEquipement(req.body, { parsedPrice, parsedWarranty }), ...identifiantsResult.errors];
  if (req.fileUploadError) {
    errors.push(req.fileUploadError);
  }
  const newFile = req.file ? req.file.filename : null;

  try {
    const [existing, employes, types] = await Promise.all([
      getEquipementById(id),
      listEmployes(),
      listTypes()
    ]);

    if (!existing) {
      deleteUploadedFile(newFile);
      return res.redirect('/');
    }

    let employe = null;
    let typeRecord = null;

    const employeIdInputRaw = req.body.employe_id;
    if (employeIdInputRaw) {
      if (!isPositiveInteger(employeIdInputRaw)) {
        errors.push("L'employé sélectionné est introuvable.");
      } else {
        employe = await getEmployeById(Number(employeIdInputRaw));
        if (!employe) {
          errors.push("L'employé sélectionné est introuvable.");
        }
      }
    }

    const typeIdInputRaw = req.body.type_id;
    if (typeIdInputRaw) {
      if (!isPositiveInteger(typeIdInputRaw)) {
        errors.push('Le type sélectionné est introuvable.');
      } else {
        typeRecord = await getTypeById(Number(typeIdInputRaw));
        if (!typeRecord) {
          errors.push('Le type sélectionné est introuvable.');
        }
      }
    }

    const equipementFormData = {
      ...existing,
      type_id: typeof req.body.type_id !== 'undefined' ? req.body.type_id : existing.type_id,
      marque: typeof req.body.marque !== 'undefined' ? req.body.marque : existing.marque,
      modele: typeof req.body.modele !== 'undefined' ? req.body.modele : existing.modele,
      numero_serie: typeof req.body.numero_serie !== 'undefined' ? req.body.numero_serie : existing.numero_serie,
      etat: typeof req.body.etat !== 'undefined' ? req.body.etat : existing.etat,
      date_achat: typeof req.body.date_achat !== 'undefined' ? req.body.date_achat : existing.date_achat,
      lieu_achat: typeof req.body.lieu_achat !== 'undefined' ? req.body.lieu_achat : existing.lieu_achat,
      prix: typeof req.body.prix !== 'undefined' ? req.body.prix : existing.prix,
      garantie_annees: typeof req.body.garantie_annees !== 'undefined' ? req.body.garantie_annees : existing.garantie_annees,
      employe_id: typeof req.body.employe_id !== 'undefined' ? req.body.employe_id : existing.employe_id,
      commentaire: typeof req.body.commentaire !== 'undefined' ? req.body.commentaire : existing.commentaire,
      identifiants
    };
    if (typeRecord) {
      equipementFormData.type = typeRecord.nom;
    }

    if (errors.length) {
      deleteUploadedFile(newFile);

      return res.status(400).render('form', {
        mode: 'edit',
        equipement: equipementFormData,
        identifiants,
        errors,
        states: allowedStates,
        employes,
        types,
        redirect: redirectToDetail ? 'detail' : null
      });
    }

    const resolvedType = typeRecord || (existing.type_id ? await getTypeById(existing.type_id) : null);
    if (!typeRecord && !resolvedType) {
      errors = [...errors, 'Le type sélectionné est introuvable.'];
      return res.status(400).render('form', {
        mode: 'edit',
        equipement: equipementFormData,
        identifiants,
        errors,
        states: allowedStates,
        employes,
        types,
        redirect: redirectToDetail ? 'detail' : null
      });
    }

    const typeToPersist = typeRecord || resolvedType;
    equipementFormData.type = typeToPersist.nom;
    equipementFormData.type_id = typeToPersist.id;

    if (newFile && existing.fichier_facture) {
      deleteUploadedFile(existing.fichier_facture);
    }

    await updateEquipement(id, {
      type: typeToPersist.nom,
      type_id: typeToPersist.id,
      marque: req.body.marque,
      modele: req.body.modele,
      numero_serie: req.body.numero_serie,
      etat: req.body.etat,
      date_achat: sanitizeDate(req.body.date_achat),
      lieu_achat: sanitizeText(req.body.lieu_achat) || null,
      prix: parsedPrice.value,
      garantie_annees: parsedWarranty.value,
      fichier_facture: newFile || existing.fichier_facture,
      employe_id: employe ? employe.id : null,
      employe_attribue: employe ? employe.nom_complet : null,
      commentaire: req.body.commentaire
    });

    await replaceIdentifiantsForEquipement(Number(id), identifiants);

    if (redirectToDetail) {
      return res.redirect(`/equipements/${id}?success=equipementUpdated`);
    }

    res.redirect('/');
  } catch (err) {
    console.error('Failed to update equipment:', err);
    deleteUploadedFile(newFile);

    let employesList = [];
    let typesList = [];
    try {
      employesList = await listEmployes();
      typesList = await listTypes();
    } catch (listErr) {
      console.error('Failed to reload employees after update error:', listErr);
    }

    res.status(500).render('form', {
      mode: 'edit',
      equipement: { ...req.body, id, identifiants },
      identifiants,
      errors: ['Impossible de mettre à jour cet équipement.'],
      states: allowedStates,
      employes: employesList,
      types: typesList,
      redirect: redirectToDetail ? 'detail' : null
    });
  }
});

router.post('/equipements/:id/evenements', handleUpload('document'), async (req, res) => {
  const { id } = req.params;
  if (!isPositiveInteger(id)) {
    deleteUploadedFile(req.file ? req.file.filename : null);
    return res.redirect('/');
  }
  const sanitizedPayload = sanitizeEvenement(req.body);
  const errors = validateEvenement(sanitizedPayload);
  const formPayload = { ...sanitizedPayload };
  if (!sanitizedPayload.date_evenement && typeof req.body.date_evenement === 'string') {
    formPayload.date_evenement = req.body.date_evenement.trim();
  }
  if (req.fileUploadError) {
    errors.push(req.fileUploadError);
  }
  const documentFile = req.file ? req.file.filename : null;

  try {
    const equipement = await getEquipementById(id);
    if (!equipement) {
      deleteUploadedFile(documentFile);
      return res.redirect('/');
    }

    let selectedEmploye = null;
    let targetEtat = null;

    if (sanitizedPayload.categorie === 'Attribution') {
      const employeIdRaw = sanitizedPayload.attribution_employe_id;
      if (!isPositiveInteger(employeIdRaw)) {
        errors.push("Sélectionnez un employé à attribuer.");
      } else {
        selectedEmploye = await getEmployeById(Number(employeIdRaw));
        if (!selectedEmploye) {
          errors.push("L'employé sélectionné est introuvable.");
        }
      }
    }

    if (sanitizedPayload.categorie === 'État') {
      if (!sanitizedPayload.nouvel_etat || !allowedStates.includes(sanitizedPayload.nouvel_etat)) {
        errors.push("Sélectionnez un état valide.");
      } else {
        targetEtat = sanitizedPayload.nouvel_etat;
      }
    }

    if (errors.length) {
      deleteUploadedFile(documentFile);
      const viewModel = await buildEquipementDetailViewModel(id, {
        eventFormMode: 'create',
        eventFormData: formPayload,
        eventErrors: errors
      });
      if (!viewModel) {
        return res.redirect('/');
      }
      return res.status(400).render('equipements/show', viewModel);
    }

    await createEvenement({
      equipement_id: Number(id),
      categorie: sanitizedPayload.categorie,
      description: sanitizedPayload.description,
      date_evenement: sanitizedPayload.date_evenement,
      document: documentFile,
      nouvel_employe_id: selectedEmploye ? selectedEmploye.id : null,
      nouvel_etat: targetEtat
    });

    if (sanitizedPayload.categorie === 'Attribution') {
      const updatePayload = buildEquipementUpdatePayload(equipement, {
        employe_id: selectedEmploye ? selectedEmploye.id : null,
        employe_attribue: selectedEmploye ? selectedEmploye.nom_complet : null
      });
      await updateEquipement(id, updatePayload);
    }

    if (sanitizedPayload.categorie === 'État' && targetEtat) {
      const updatePayload = buildEquipementUpdatePayload(equipement, {
        etat: targetEtat
      });
      await updateEquipement(id, updatePayload);
    }

    res.redirect(`/equipements/${id}?success=eventCreated`);
  } catch (err) {
    console.error('Failed to create event:', err);
    deleteUploadedFile(documentFile);
    try {
      const fallbackView = await buildEquipementDetailViewModel(id, {
        eventFormMode: 'create',
        eventFormData: formPayload,
        eventErrors: ["Impossible d'ajouter cet événement."]
      });
      if (fallbackView) {
        return res.status(500).render('equipements/show', fallbackView);
      }
    } catch (innerErr) {
      console.error('Failed to rebuild detail view after event creation error:', innerErr);
    }
  res.redirect(`/equipements/${id}?error=${encodeURIComponent("Impossible d'ajouter cet événement.")}`);
  }
});

router.post('/equipements/:id/evenements/:eventId/modifier', handleUpload('document'), async (req, res) => {
  const { id, eventId } = req.params;
  if (!isPositiveInteger(id) || !isPositiveInteger(eventId)) {
    deleteUploadedFile(req.file ? req.file.filename : null);
    return res.redirect('/');
  }
  const sanitizedPayload = sanitizeEvenement(req.body);
  const errors = validateEvenement(sanitizedPayload);
  const formPayload = { ...sanitizedPayload };
  if (!sanitizedPayload.date_evenement && typeof req.body.date_evenement === 'string') {
    formPayload.date_evenement = req.body.date_evenement.trim();
  }
  if (req.fileUploadError) {
    errors.push(req.fileUploadError);
  }
  const newDocument = req.file ? req.file.filename : null;
  const removeDocument = req.body.remove_document === '1' || req.body.remove_document === 'on';

  try {
    const [equipement, existingEvent] = await Promise.all([
      getEquipementById(id),
      getEvenementById(eventId)
    ]);

    if (!equipement) {
      deleteUploadedFile(newDocument);
      return res.redirect('/');
    }

    if (!existingEvent || Number(existingEvent.equipement_id) !== Number(id)) {
  deleteUploadedFile(newDocument);
      return res.redirect(`/equipements/${id}?error=${encodeURIComponent('Événement introuvable.')}`);
    }

    const eventFormData = {
      ...formPayload,
      id: existingEvent.id,
      document: existingEvent.document
    };

    let selectedEmploye = null;
    let targetEtat = null;

    if (sanitizedPayload.categorie === 'Attribution') {
      const employeIdRaw = sanitizedPayload.attribution_employe_id;
      if (!isPositiveInteger(employeIdRaw)) {
        errors.push("Sélectionnez un employé à attribuer.");
      } else {
        selectedEmploye = await getEmployeById(Number(employeIdRaw));
        if (!selectedEmploye) {
          errors.push("L'employé sélectionné est introuvable.");
        }
      }
    }

    if (sanitizedPayload.categorie === 'État') {
      if (!sanitizedPayload.nouvel_etat || !allowedStates.includes(sanitizedPayload.nouvel_etat)) {
        errors.push("Sélectionnez un état valide.");
      } else {
        targetEtat = sanitizedPayload.nouvel_etat;
      }
    }

    if (errors.length) {
      deleteUploadedFile(newDocument);
      const viewModel = await buildEquipementDetailViewModel(id, {
        eventFormMode: 'edit',
        eventFormData,
        eventErrors: errors
      });
      if (!viewModel) {
        return res.redirect('/');
      }
      return res.status(400).render('equipements/show', viewModel);
    }

    let documentToPersist = existingEvent.document;
    if (newDocument) {
      deleteUploadedFile(existingEvent.document);
      documentToPersist = newDocument;
    } else if (removeDocument && existingEvent.document) {
      deleteUploadedFile(existingEvent.document);
      documentToPersist = null;
    }

    await updateEvenement(eventId, {
      categorie: sanitizedPayload.categorie,
      description: sanitizedPayload.description,
      date_evenement: sanitizedPayload.date_evenement,
      document: documentToPersist,
      nouvel_employe_id: selectedEmploye ? selectedEmploye.id : null,
      nouvel_etat: targetEtat
    });

    if (sanitizedPayload.categorie === 'Attribution') {
      const updatePayload = buildEquipementUpdatePayload(equipement, {
        employe_id: selectedEmploye ? selectedEmploye.id : null,
        employe_attribue: selectedEmploye ? selectedEmploye.nom_complet : null
      });
      await updateEquipement(id, updatePayload);
    }

    if (sanitizedPayload.categorie === 'État' && targetEtat) {
      const updatePayload = buildEquipementUpdatePayload(equipement, {
        etat: targetEtat
      });
      await updateEquipement(id, updatePayload);
    }

    res.redirect(`/equipements/${id}?success=eventUpdated`);
  } catch (err) {
    console.error('Failed to update event:', err);
    deleteUploadedFile(newDocument);
    try {
      const latestEvent = await getEvenementById(eventId);
      const fallbackView = await buildEquipementDetailViewModel(id, {
        eventFormMode: 'edit',
        eventFormData: latestEvent
          ? {
              id: Number(eventId),
              categorie: latestEvent.categorie,
              date_evenement: sanitizeDate(latestEvent.date_evenement) || latestEvent.date_evenement,
              description: latestEvent.description || '',
              attribution_employe_id: latestEvent.nouvel_employe_id ? String(latestEvent.nouvel_employe_id) : '',
              nouvel_etat: latestEvent.nouvel_etat || '',
              document: latestEvent.document || null
            }
          : { ...formPayload, id: Number(eventId) },
        eventErrors: ["Impossible de mettre à jour cet événement."]
      });
      if (fallbackView) {
        return res.status(500).render('equipements/show', fallbackView);
      }
    } catch (innerErr) {
      console.error('Failed to rebuild detail view after event update error:', innerErr);
    }
  res.redirect(`/equipements/${id}?error=${encodeURIComponent('Impossible de mettre à jour cet événement.')}`);
  }
});

router.post('/equipements/:id/evenements/:eventId/supprimer', async (req, res) => {
  const { id, eventId } = req.params;
  if (!isPositiveInteger(id) || !isPositiveInteger(eventId)) {
    return res.redirect('/');
  }

  try {
    const existingEvent = await getEvenementById(eventId);
    if (!existingEvent || Number(existingEvent.equipement_id) !== Number(id)) {
      return res.redirect(`/equipements/${id}?error=${encodeURIComponent('Événement introuvable.')}`);
    }

    await deleteEvenement(eventId);
    deleteUploadedFile(existingEvent.document);

    res.redirect(`/equipements/${id}?success=eventDeleted`);
  } catch (err) {
    console.error('Failed to delete event:', err);
  res.redirect(`/equipements/${id}?error=${encodeURIComponent('Impossible de supprimer cet événement.')}`);
  }
});

router.get('/supprimer/:id', async (req, res) => {
  try {
    const equipement = await getEquipementById(req.params.id);
    if (equipement) {
      await deleteEquipement(req.params.id);
      deleteUploadedFile(equipement.fichier_facture);
    }
    res.redirect('/');
  } catch (err) {
    console.error('Failed to delete equipment:', err);
    res.status(500).render('error', { message: 'Impossible de supprimer cet équipement.' });
  }
});

router.get('/export', async (_req, res) => {
  try {
    const equipements = await exportEquipements();
    const headers = [
      'id',
      'type',
      'type_id',
      'marque',
      'modele',
      'numero_serie',
      'etat',
      'date_achat',
      'employe_id',
      'employe_nom_complet',
      'employe_attribue',
      'commentaire',
      'fichier_facture',
      'date_creation',
      'date_modification'
    ];

    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    };

    const rows = equipements.map((item) => headers.map((h) => escapeCsvValue(item[h])).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const fileName = `invent97-export-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Failed to export equipment:', err);
    res.status(500).render('error', { message: "Impossible d'exporter les données." });
  }
});

module.exports = router;
