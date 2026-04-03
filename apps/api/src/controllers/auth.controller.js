const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { supabase } = require('@recordai/db');
const env = require('../config/env');
const { AppError } = require('../errors');
const { exchangeCodeForTokens, getUserInfo } = require('../services/google');

function makeJwt(user, extra = {}) {
  return jwt.sign(
    { tenantId: user.tenant_id, userId: user.id, role: user.role, ...extra },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function register(req, res, next) {
  try {
    const { tenantName, slug, email, password } = req.body;
    if (!tenantName || !slug || !email || !password)
      throw new AppError('tenantName, slug, email and password are required', 400);

    const { data: existingTenant } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (existingTenant) throw new AppError('Slug already taken', 409);

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existingUser) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants').insert({ name: tenantName, slug }).select().single();
    if (tenantErr) throw tenantErr;

    const { data: user, error: userErr } = await supabase
      .from('users').insert({ tenant_id: tenant.id, email, password_hash: passwordHash, role: 'owner' }).select().single();
    if (userErr) throw userErr;

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
    const token = makeJwt(user, { tenantName: tenant?.name, email: user.email });
    return res.json({ success: true, data: { token, tenantId: user.tenant_id, userId: user.id, role: user.role } });
  } catch (err) { return next(err); }
}

async function googleAuth(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('code is required', 400);

    // Exchange code for tokens (includes refresh_token for offline access)
    const tokens = await exchangeCodeForTokens(code);
    const { access_token, refresh_token } = tokens;

    const { email, name, picture } = await getUserInfo(access_token);
    if (!email) throw new AppError('No se pudo obtener el email de Google', 401);

    let { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();

    if (user) {
      // Update tokens on every login
      await supabase.from('users').update({
        google_access_token:  access_token,
        google_refresh_token: refresh_token || user.google_refresh_token,
      }).eq('id', user.id);

      const { data: tenant } = await supabase.from('tenants').select('name').eq('id', user.tenant_id).maybeSingle();
      const token = makeJwt(user, { name, picture, tenantName: tenant?.name, email });
      return res.json({ success: true, data: { token, tenantId: user.tenant_id, userId: user.id, role: user.role } });
    }

    // New user — auto-create tenant
    const baseSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants').insert({ name: name || email, slug }).select().single();
    if (tenantErr) throw tenantErr;

    const { data: newUser, error: userErr } = await supabase
      .from('users').insert({
        tenant_id:            tenant.id,
        email,
        password_hash:        null,
        role:                 'owner',
        google_access_token:  access_token,
        google_refresh_token: refresh_token || null,
      }).select().single();
    if (userErr) throw userErr;

    const token = makeJwt(newUser, { name, picture, tenantName: tenant.name, email });
    return res.status(201).json({ success: true, data: { token, tenantId: tenant.id, userId: newUser.id, role: newUser.role } });
  } catch (err) { return next(err); }
}

module.exports = { register, login, googleAuth };
