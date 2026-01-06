const express = require('express');
const {
  listEmployes,
  getEmployeById,
  createEmploye,
  updateEmploye,
  deleteEmploye,
  detachEmployeFromEquipements
} = require('../models/employeModel');
const { listEquipementsByEmploye } = require('../models/equipementModel');
const stateBadgeTheme = require('../constants/stateBadgeTheme');

const router = express.Router();
const TERRITOIRES = ['martinique', 'guadeloupe'];

function validateEmploye(body) {
  const errors = [];
  const { prenom, nom, email, telephone, territoire } = body;

  if (!prenom) errors.push('Le prénom est requis.');
  if (!nom) errors.push('Le nom est requis.');

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.push("L'adresse e-mail n'est pas valide.");
  }

  if (telephone && telephone.replace(/[^0-9+]/g, '').length < 6) {
    errors.push('Le numéro de téléphone semble invalide.');
  }

  if (!territoire || !TERRITOIRES.includes(territoire)) {
    errors.push('Sélectionnez le territoire de rattachement.');
  }

  return errors;
}

function sanitizeEmploye(body) {
  const trim = (value) => (typeof value === 'string' ? value.trim() : value);
  const normalizeTerritoire = (value) => {
    if (typeof value !== 'string') return '';
    const lowered = value.trim().toLowerCase();
    return TERRITOIRES.includes(lowered) ? lowered : '';
  };

  return {
    prenom: trim(body.prenom || ''),
    nom: trim(body.nom || ''),
    email: trim(body.email || ''),
    telephone: trim(body.telephone || ''),
    poste: trim(body.poste || ''),
    territoire: normalizeTerritoire(body.territoire),
    commentaire: trim(body.commentaire || '')
  };
}

function resolveSuccessMessage(code) {
  switch (code) {
    case 'created':
      return 'Employé créé avec succès.';
    case 'updated':
      return 'Employé mis à jour avec succès.';
    case 'deleted':
      return "Employé supprimé et équipements détachés.";
    default:
      return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const employes = await listEmployes();
    const employesByTerritoire = TERRITOIRES.reduce((acc, territoire) => {
      const group = employes
        .filter((employe) => (employe.territoire || TERRITOIRES[0]) === territoire)
        .slice()
        .sort((a, b) => (a.nom_complet || '').localeCompare(b.nom_complet || '', 'fr', { sensitivity: 'base' }));
      acc[territoire] = group;
      return acc;
    }, {});

    res.render('employes/index', {
      employes,
      employesByTerritoire,
      territoires: TERRITOIRES,
      successMessage: resolveSuccessMessage(req.query.success),
      errorMessage: req.query.error || null
    });
  } catch (err) {
    console.error('Failed to list employees:', err);
    res.status(500).render('error', { message: 'Impossible de récupérer les employés.' });
  }
});

router.get('/ajouter', (_req, res) => {
  res.render('employes/form', {
    mode: 'create',
    employe: { territoire: TERRITOIRES[0] },
    territoires: TERRITOIRES,
    errors: []
  });
});

router.post('/ajouter', async (req, res) => {
  const payload = sanitizeEmploye(req.body);
  const errors = validateEmploye(payload);

  if (errors.length) {
    return res.status(400).render('employes/form', {
      mode: 'create',
      employe: { ...payload },
      territoires: TERRITOIRES,
      errors
    });
  }

  try {
    await createEmploye(payload);
    res.redirect('/employes?success=created');
  } catch (err) {
    console.error('Failed to create employee:', err);
    const errorMessage = err && err.code === 'SQLITE_CONSTRAINT' ? "L'adresse e-mail est déjà utilisée." : "Impossible d'enregistrer cet employé.";
    res.status(500).render('employes/form', {
      mode: 'create',
      employe: { ...payload },
      territoires: TERRITOIRES,
      errors: [errorMessage]
    });
  }
});

router.get('/modifier/:id', async (req, res) => {
  try {
    const employe = await getEmployeById(req.params.id);
    if (!employe) {
      return res.redirect('/employes');
    }

    res.render('employes/form', {
      mode: 'edit',
      employe,
      territoires: TERRITOIRES,
      errors: []
    });
  } catch (err) {
    console.error('Failed to load employee:', err);
    res.status(500).render('error', { message: 'Impossible de charger cet employé.' });
  }
});

router.post('/modifier/:id', async (req, res) => {
  const { id } = req.params;
  const payload = sanitizeEmploye(req.body);
  const errors = validateEmploye(payload);

  try {
    const existing = await getEmployeById(id);
    if (!existing) {
      return res.redirect('/employes');
    }

    if (errors.length) {
      return res.status(400).render('employes/form', {
        mode: 'edit',
        employe: { ...existing, ...payload, id },
        territoires: TERRITOIRES,
        errors
      });
    }

    await updateEmploye(id, payload);
    res.redirect('/employes?success=updated');
  } catch (err) {
    console.error('Failed to update employee:', err);
    const errorMessage = err && err.code === 'SQLITE_CONSTRAINT' ? "L'adresse e-mail est déjà utilisée." : 'Impossible de mettre à jour cet employé.';
    res.status(500).render('employes/form', {
      mode: 'edit',
      employe: { ...payload, id },
      territoires: TERRITOIRES,
      errors: [errorMessage]
    });
  }
});

router.get('/supprimer/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const employe = await getEmployeById(id);
    if (!employe) {
      return res.redirect('/employes');
    }

    await detachEmployeFromEquipements(id);
    await deleteEmploye(id);
    res.redirect('/employes?success=deleted');
  } catch (err) {
    console.error('Failed to delete employee:', err);
    res.redirect('/employes?error=Impossible%20de%20supprimer%20cet%20employ%C3%A9.');
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const employe = await getEmployeById(id);
    if (!employe) {
      return res.redirect('/employes');
    }

    const equipements = await listEquipementsByEmploye(Number(id));
    // Aggregate basic counts per equipment state for quick stats in the view.
    const assignmentStats = equipements.reduce(
      (acc, item) => {
        const stateKey = item.etat || 'Inconnu';
        acc.total += 1;
        acc.byState[stateKey] = (acc.byState[stateKey] || 0) + 1;
        return acc;
      },
      { total: 0, byState: {} }
    );

    res.render('employes/show', {
      employe,
      equipements,
      territoires: TERRITOIRES,
      assignmentStats,
      stateBadgeTheme,
      successMessage: typeof req.query.success === 'string' ? req.query.success : null,
      errorMessage: typeof req.query.error === 'string' ? req.query.error : null
    });
  } catch (err) {
    console.error('Failed to load employee detail:', err);
    res.status(500).render('error', { message: 'Impossible de charger cette fiche collaborateur.' });
  }
});

module.exports = router;
