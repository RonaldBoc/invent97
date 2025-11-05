const express = require('express');
const { validateAdminCredentials } = require('../models/adminModel');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { error: null, username: '' });
});

router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('login', {
      error: 'Merci de renseigner le login et le mot de passe.',
      username: username || ''
    });
  }

  try {
    const admin = await validateAdminCredentials(username, password);
    if (!admin) {
      return res.status(401).render('login', {
        error: 'Identifiants invalides.',
        username
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration failed:', err);
        return res.status(500).render('login', {
          error: "Impossible de traiter la connexion pour le moment.",
          username
        });
      }

      req.session.userId = admin.id;
      req.session.username = admin.username;
      res.redirect('/');
    });
  } catch (err) {
    console.error('Login failure:', err);
    res.status(500).render('login', {
      error: "Impossible de traiter la connexion pour le moment.",
      username: username || ''
    });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
