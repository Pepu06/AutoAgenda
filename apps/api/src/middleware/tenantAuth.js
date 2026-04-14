const { supabase } = require('@autoagenda/db');
const logger = require('../config/logger');

/**
 * Middleware: validate user has access to the requested tenant.
 * Reads tenantId from req.body or req.query; validates against user_tenants table.
 * Sets req.tenantId if access is confirmed (overrides JWT tenantId for multi-tenant).
 * Falls back to JWT tenantId if no tenantId is provided in request.
 */
async function validateTenantAccess(req, res, next) {
  try {
    const requestedTenantId = req.body?.tenantId || req.query?.tenantId;

    // No tenantId in request — fall back to JWT tenantId (single-tenant flow)
    if (!requestedTenantId) {
      return next();
    }

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Same tenant as JWT — no extra check needed
    if (requestedTenantId === req.tenantId) {
      return next();
    }

    // Different tenant — verify access via user_tenants table
    const { data: access, error } = await supabase
      .from('user_tenants')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', requestedTenantId)
      .maybeSingle();

    if (error) {
      logger.error({ error: error.message, userId, requestedTenantId }, 'Error checking user_tenants access');
      return res.status(500).json({ error: 'Error verificando acceso al tenant' });
    }

    if (!access) {
      return res.status(403).json({ error: 'Acceso denegado a este tenant' });
    }

    req.tenantId = requestedTenantId;
    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Error en validateTenantAccess');
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get all tenants accessible by a user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getUserTenants(userId) {
  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenant_id, role, tenants(id, name, business_name, slug, subscriptions(plan, status))')
    .eq('user_id', userId);

  if (error) {
    logger.error({ error: error.message, userId }, 'Error fetching user tenants');
    return [];
  }

  return data || [];
}

module.exports = { validateTenantAccess, getUserTenants };
