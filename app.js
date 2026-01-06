const path = require('path');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');

require('./models/db');
const { ensureAdminSeeded } = require('./models/adminModel');
const authRouter = require('./routes/auth');
const equipementsRouter = require('./routes/equipements');
const employesRouter = require('./routes/employes');
const typesRouter = require('./routes/types');
const { authRequired } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize after a short delay to allow db to be ready
setTimeout(async () => {
  try {
    await ensureAdminSeeded();
    console.log('Admin user initialized');
  } catch (err) {
    console.error('Failed to seed admin user:', err);
  }
}, 500);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'invent97-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
  })
);

app.use((req, res, next) => {
  res.locals.authenticated = Boolean(req.session.userId);
  res.locals.username = req.session.username || null;
  res.locals.currentPath = `${req.baseUrl || ''}${req.path || ''}` || '/';
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', authRouter);
app.use('/', authRequired, equipementsRouter);
app.use('/employes', authRequired, employesRouter);
app.use('/types', authRequired, typesRouter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  const message = err.userMessage || 'Une erreur interne est survenue.';
  res.status(status).render('error', { message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
