const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const env = require('./config/env');
const { authLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth.routes');
const contactsRoutes = require('./routes/contacts.routes');
const servicesRoutes = require('./routes/services.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const webhookRoutes = require('./routes/webhook.routes');
const calendarRoutes = require('./routes/calendar.routes');
const confirmationRoutes = require('./routes/confirmation.routes');
const settingsRoutes = require('./routes/settings.routes');
const subscriptionRoutes = require('./routes/subscription.routes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/', (req, res) => {
	res.send(`
		<h1>Bienvenido a AutoAgenda</h1>
		<p>Tu sistema inteligente de recordatorios.</p>
		<a href="/privacy">Política de Privacidad</a> |
		<a href="/terms">Términos del Servicio</a>
	`);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Public confirmation pages (no auth)
app.use('/', confirmationRoutes);

app.use('/auth', authLimiter, authRoutes);
app.use('/contacts', contactsRoutes);
app.use('/services', servicesRoutes);
app.use('/appointments', appointmentsRoutes);
app.use('/webhook', webhookRoutes);
app.use('/calendar', calendarRoutes);
app.use('/settings', settingsRoutes);
app.use('/subscription', subscriptionRoutes);

app.use(errorHandler);

module.exports = app;
