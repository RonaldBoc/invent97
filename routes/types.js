const express = require('express');
const {
  listTypes,
  getTypeById,
  createType,
  updateType,
  deleteType,
  detachTypeFromEquipements
} = require('../models/typeModel');

const router = express.Router();

function sanitizeType(body) {
  const trim = (value) => (typeof value === 'string' ? value.trim() : value);
  return {
    nom: trim(body.nom || ''),
    description: trim(body.description || '')
  };
}

function validateType(payload) {
  const errors = [];
  if (!payload.nom) {
    errors.push('Le nom du type est requis.');
  }
  return errors;
}

function resolveSuccessMessage(code) {
  switch (code) {
    case 'created':
      return 'Type créé avec succès.';
    case 'updated':
      return 'Type mis à jour avec succès.';
    case 'deleted':
      return "Type supprimé et équipements détachés.";
    default:
      return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const types = await listTypes();
    res.render('types/index', {
      types,
      successMessage: resolveSuccessMessage(req.query.success),
      errorMessage: req.query.error || null
    });
  } catch (err) {
    console.error('Failed to list types:', err);
    res.status(500).render('error', { message: 'Impossible de récupérer les types de matériel.' });
  }
});

router.get('/ajouter', (_req, res) => {
  res.render('types/form', {
    mode: 'create',
    type: {},
    errors: []
  });
});

router.post('/ajouter', async (req, res) => {
  const payload = sanitizeType(req.body);
  const errors = validateType(payload);

  if (errors.length) {
    return res.status(400).render('types/form', {
      mode: 'create',
      type: { ...payload },
      errors
    });
  }

  try {
    await createType(payload);
    res.redirect('/types?success=created');
  } catch (err) {
    console.error('Failed to create type:', err);
    const errorMessage = err && err.code === 'SQLITE_CONSTRAINT'
      ? 'Ce nom de type est déjà utilisé.'
      : "Impossible d'enregistrer ce type.";
    res.status(500).render('types/form', {
      mode: 'create',
      type: { ...payload },
      errors: [errorMessage]
    });
  }
});

router.get('/modifier/:id', async (req, res) => {
  try {
    const typeRecord = await getTypeById(req.params.id);
    if (!typeRecord) {
      return res.redirect('/types');
    }
    res.render('types/form', {
      mode: 'edit',
      type: typeRecord,
      errors: []
    });
  } catch (err) {
    console.error('Failed to load type:', err);
    res.status(500).render('error', { message: 'Impossible de charger ce type.' });
  }
});

router.post('/modifier/:id', async (req, res) => {
  const { id } = req.params;
  const payload = sanitizeType(req.body);
  const errors = validateType(payload);

  try {
    const existing = await getTypeById(id);
    if (!existing) {
      return res.redirect('/types');
    }

    if (errors.length) {
      return res.status(400).render('types/form', {
        mode: 'edit',
        type: { ...existing, ...payload, id },
        errors
      });
    }

    await updateType(id, payload);
    res.redirect('/types?success=updated');
  } catch (err) {
    console.error('Failed to update type:', err);
    const errorMessage = err && err.code === 'SQLITE_CONSTRAINT'
      ? 'Ce nom de type est déjà utilisé.'
      : 'Impossible de mettre à jour ce type.';
    res.status(500).render('types/form', {
      mode: 'edit',
      type: { ...payload, id },
      errors: [errorMessage]
    });
  }
});

router.get('/supprimer/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await getTypeById(id);
    if (!existing) {
      return res.redirect('/types');
    }

    await detachTypeFromEquipements(id);
    await deleteType(id);
    res.redirect('/types?success=deleted');
  } catch (err) {
    console.error('Failed to delete type:', err);
    res.redirect('/types?error=Impossible%20de%20supprimer%20ce%20type.');
  }
});

module.exports = router;
