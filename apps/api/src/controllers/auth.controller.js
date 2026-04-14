const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('@autoagenda/db');
const env = require('../config/env');
const { AppError } = require('../errors');
const { exchangeCodeForTokens, getUserInfo } = require('../services/google');
const { sendEmail } = require('../services/email');
const logger = require('../config/logger');

function makeJwt(user, extra = {}) {
  return jwt.sign(
    { tenantId: user.tenant_id, userId: user.id, role: user.role, ...extra },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/** Send a verification email to the user. Fire-and-forget. */
async function sendVerificationEmail(userId, email) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  await supabase.from('users').update({
    email_verification_token_hash: tokenHash,
    email_verification_expires_at: expiresAt,
  }).eq('id', userId);

  const verifyUrl = `${env.CORS_ORIGIN}/verify-email?token=${rawToken}`;

  sendEmail({
    to: email,
    subject: 'Verificá tu email — AutoAgenda',
    text: `Bienvenido a AutoAgenda. Para verificar tu email hacé clic en el siguiente enlace (válido por 24 horas):\n${verifyUrl}`,
    html: `<p>Bienvenido a AutoAgenda. Para verificar tu email hacé clic en el siguiente enlace (válido por 24 horas):</p><p><a href="${verifyUrl}">Verificar email</a></p>`,
  }).catch(err => {
    logger.error({ err, email, userId }, '[Email] Failed to send verification email');
  }); // Non-blocking
}

async function register(req, res, next) {
  try {
    const { tenantName, email, password } = req.body;
    if (!tenantName || !email || !password)
      throw new AppError('tenantName, email and password are required', 400);

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existingUser) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants').insert({ name: tenantName }).select().single();
    if (tenantErr) throw tenantErr;

    const { data: user, error: userErr } = await supabase
      .from('users').insert({
        tenant_id: tenant.id,
        email,
        password_hash: passwordHash,
        role: 'owner',
        email_verified: false,
      }).select().single();
    if (userErr) throw userErr;

    // Send verification email (non-blocking)
    sendVerificationEmail(user.id, email).catch(err => {
      logger.error({ err, email, userId: user.id }, '[Register] Failed to send verification email');
    });

    const token = makeJwt(user, { tenantName, email });
    return res.status(201).json({ success: true, data: { token, tenantId: tenant.id, userId: user.id, role: user.role } });
  } catch (err) { return next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email and password are required', 400);

    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (!user || !user.password_hash) throw new AppError('Credenciales inválidas', 401);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Credenciales inválidas', 401);

    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', user.tenant_id).maybeSingle();
    const token = makeJwt(user, { tenantName: tenant?.name, email: user.email, emailVerified: user.email_verified ?? true });
    return res.json({ success: true, data: { token, tenantId: user.tenant_id, userId: user.id, role: user.role } });
  } catch (err) { return next(err); }
}

async function googleAuth(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('code is required', 400);

    const tokens = await exchangeCodeForTokens(code);
    const { access_token, refresh_token } = tokens;

    const { email, name, picture } = await getUserInfo(access_token);
    if (!email) throw new AppError('No se pudo obtener el email de Google', 401);

    let { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();

    if (user) {
      await supabase.from('users').update({
        google_access_token:  access_token,
        google_refresh_token: refresh_token || user.google_refresh_token,
        email_verified: true,
      }).eq('id', user.id);

      const { data: tenant } = await supabase.from('tenants').select('name').eq('id', user.tenant_id).maybeSingle();
      const token = makeJwt(user, { name, picture, tenantName: tenant?.name, email, emailVerified: true });
      return res.json({ success: true, data: { token, tenantId: user.tenant_id, userId: user.id, role: user.role } });
    }

    // New user — auto-create tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants').insert({ name: name || email }).select().single();
    if (tenantErr) throw tenantErr;

    const { data: newUser, error: userErr } = await supabase
      .from('users').insert({
        tenant_id:            tenant.id,
        email,
        password_hash:        null,
        role:                 'owner',
        google_access_token:  access_token,
        google_refresh_token: refresh_token || null,
        email_verified:       true,
      }).select().single();
    if (userErr) throw userErr;

    const token = makeJwt(newUser, { name, picture, tenantName: tenant.name, email, emailVerified: true });
    return res.status(201).json({ success: true, data: { token, tenantId: tenant.id, userId: newUser.id, role: newUser.role } });
  } catch (err) { return next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) throw new AppError('Email is required', 400);

    // Always respond 200 to avoid user enumeration
    const { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await supabase.from('password_reset_tokens').insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      const resetUrl = `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`;

      sendEmail({
        to: email,
        subject: 'Recuperar contraseña — AutoAgenda',
        text: `Recibiste este mensaje porque solicitaste restablecer tu contraseña.\n\nHacé clic en el siguiente enlace (válido por 1 hora):\n${resetUrl}\n\nSi no lo solicitaste, ignorá este email.`,
        html: `<p>Recibiste este mensaje porque solicitaste restablecer tu contraseña.</p><p><a href="${resetUrl}">Restablecer contraseña</a> (válido por 1 hora)</p><p>Si no lo solicitaste, ignorá este email.</p>`,
      }).catch(err => {
        logger.error({ err, email }, '[ForgotPassword] Failed to send reset email');
      }); // Fire-and-forget
    }

    return res.json({ success: true, message: 'Si el email existe, te enviamos las instrucciones.' });
  } catch (err) { return next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) throw new AppError('token and password are required', 400);
    if (password.length < 8) throw new AppError('La contraseña debe tener al menos 8 caracteres', 400);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: record } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!record) throw new AppError('Token inválido o expirado', 400);
    if (record.used_at) throw new AppError('Este enlace ya fue utilizado', 400);
    if (new Date(record.expires_at) < new Date()) throw new AppError('El enlace expiró. Solicitá uno nuevo.', 400);

    const passwordHash = await bcrypt.hash(password, 10);

    await Promise.all([
      supabase.from('users').update({ password_hash: passwordHash }).eq('id', record.user_id),
      supabase.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', record.id),
    ]);

    return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) { return next(err); }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('token is required', 400);

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: user } = await supabase
      .from('users')
      .select('id, email_verification_expires_at, email_verified')
      .eq('email_verification_token_hash', tokenHash)
      .maybeSingle();

    if (!user) throw new AppError('Token inválido o expirado', 400);
    if (user.email_verified) return res.json({ success: true, message: 'Email ya verificado.' });
    if (new Date(user.email_verification_expires_at) < new Date()) throw new AppError('El enlace expiró. Solicitá uno nuevo.', 400);

    await supabase.from('users').update({
      email_verified: true,
      email_verification_token_hash: null,
      email_verification_expires_at: null,
    }).eq('id', user.id);

    return res.json({ success: true, message: 'Email verificado correctamente.' });
  } catch (err) { return next(err); }
}

async function resendVerification(req, res, next) {
  try {
    // req.userId injected by auth middleware
    const { data: user } = await supabase
      .from('users')
      .select('id, email, email_verified, email_verification_expires_at')
      .eq('id', req.userId)
      .single();

    if (!user) throw new AppError('Usuario no encontrado', 404);
    if (user.email_verified) return res.json({ success: true, message: 'Email ya verificado.' });

    // Simple rate limit: only resend if last token is older than 1 minute
    if (user.email_verification_expires_at) {
      const expiresAt = new Date(user.email_verification_expires_at);
      const issuedAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
      if (Date.now() - issuedAt.getTime() < 60 * 1000) {
        throw new AppError('Esperá 1 minuto antes de solicitar otro email.', 429);
      }
    }

    await sendVerificationEmail(user.id, user.email);
    return res.json({ success: true, message: 'Email de verificación reenviado.' });
  } catch (err) { return next(err); }
}

module.exports = { register, login, googleAuth, forgotPassword, resetPassword, verifyEmail, resendVerification };
