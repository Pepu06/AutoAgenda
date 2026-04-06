const { supabase } = require('@autoagenda/db');
const env = require('../config/env');
const { ValidationError, ForbiddenError, NotFoundError } = require('../errors');
const { uploadPaymentProof, listPaymentProofs, getPaymentProofById, downloadPaymentProof, updatePaymentProofStatus } = require('../services/googleDrive');
const logger = require('../config/logger');

function assertAdminPassword(req) {
  const adminPassword = req.headers['x-admin-password'];
  if (!adminPassword || adminPassword !== env.ADMIN_PANEL_PASSWORD) {
    throw new ForbiddenError('Admin password inválida');
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
}

async function createPaymentProof(req, res, next) {
  try {
    const { plan, dataUrl } = req.body || {};

    if (!plan || !['inicial', 'profesional', 'custom'].includes(plan)) {
      throw new ValidationError('Plan inválido');
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      throw new ValidationError('Comprobante inválido. Debe ser una imagen en base64.');
    }

    const fileSizeBytes = Math.floor((parsed.base64Data.length * 3) / 4);
    if (fileSizeBytes > 8 * 1024 * 1024) {
      throw new ValidationError('La imagen supera 8MB.');
    }

    const { data: user } = await supabase
      .from('users')
      .select('email, tenant_id')
      .eq('id', req.userId)
      .maybeSingle();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', req.tenantId)
      .maybeSingle();

    const uploaded = await uploadPaymentProof({
      tenantId: req.tenantId,
      tenantName: tenant?.name || 'Mi Negocio',
      tenantEmail: user?.email || '',
      plan,
      mimeType: parsed.mimeType,
      base64Data: parsed.base64Data,
    });

    logger.info({ tenantId: req.tenantId, fileId: uploaded.id, plan }, 'Payment proof uploaded to Google Drive');

    return res.status(201).json({
      success: true,
      proof: {
        id: uploaded.id,
        plan,
        imageUrl: uploaded.imageUrl,
        webViewLink: uploaded.webViewLink,
        createdAt: uploaded.createdTime,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminPaymentProofs(req, res, next) {
  try {
    assertAdminPassword(req);

    const proofs = await listPaymentProofs();
    const tenantIds = [...new Set(proofs.map(p => p.tenantId).filter(Boolean))];
    const emailsWithoutTenant = [...new Set(
      proofs
        .filter((p) => !p.tenantId && p.tenantEmail && p.tenantEmail !== '—')
        .map((p) => p.tenantEmail)
    )];

    let tenantPhoneById = {};
    if (tenantIds.length) {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, admin_whatsapp')
        .in('id', tenantIds);

      tenantPhoneById = (tenants || []).reduce((acc, t) => {
        acc[t.id] = t.admin_whatsapp || '';
        return acc;
      }, {});
    }

    let tenantIdByEmail = {};
    if (emailsWithoutTenant.length) {
      const { data: users } = await supabase
        .from('users')
        .select('email, tenant_id')
        .in('email', emailsWithoutTenant);

      tenantIdByEmail = (users || []).reduce((acc, u) => {
        if (u?.email && u?.tenant_id) acc[u.email] = u.tenant_id;
        return acc;
      }, {});

      const missingTenantIds = [...new Set(Object.values(tenantIdByEmail).filter(Boolean))]
        .filter((id) => !tenantPhoneById[id]);

      if (missingTenantIds.length) {
        const { data: extraTenants } = await supabase
          .from('tenants')
          .select('id, admin_whatsapp')
          .in('id', missingTenantIds);

        for (const t of (extraTenants || [])) {
          tenantPhoneById[t.id] = t.admin_whatsapp || '';
        }
      }
    }

    return res.json({
      proofs: proofs.map((proof) => ({
        ...proof,
        adminWhatsapp: tenantPhoneById[proof.tenantId || tenantIdByEmail[proof.tenantEmail]] || '',
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function approvePaymentProof(req, res, next) {
  try {
    assertAdminPassword(req);

    const { proofId } = req.params;
    if (!proofId) throw new ValidationError('proofId es requerido');

    const proof = await getPaymentProofById(proofId);
    if (!proof.tenantId) {
      throw new NotFoundError('No se encontró tenant asociado al comprobante');
    }

    if (!['inicial', 'profesional', 'custom'].includes(proof.plan)) {
      throw new ValidationError('El comprobante no tiene un plan válido para aprobar');
    }

    // Mapear nombres del frontend a enums de la DB
    const planMapping = {
      inicial: 'basic',
      profesional: 'pro',
      custom: 'pro', // custom también usa pro
    };

    const dbPlan = planMapping[proof.plan];

    const now = new Date();
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    // Check if subscription exists
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('tenant_id', proof.tenantId)
      .maybeSingle();

    let error;
    if (existing) {
      // Update existing subscription
      ({ error } = await supabase
        .from('subscriptions')
        .update({
          plan: dbPlan,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: currentPeriodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        })
        .eq('tenant_id', proof.tenantId));
    } else {
      // Insert new subscription (let DB generate ID via default)
      ({ error } = await supabase
        .from('subscriptions')
        .insert({
          tenant_id: proof.tenantId,
          plan: dbPlan,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: currentPeriodEnd.toISOString(),
          cancel_at_period_end: false,
        }));
    }

    if (error) throw error;

    // Mark proof as approved in Google Drive
    await updatePaymentProofStatus(proofId, 'approved');

    logger.info({ proofId, tenantId: proof.tenantId, plan: dbPlan }, 'Payment proof approved and subscription updated');

    return res.json({
      success: true,
      message: `Plan ${proof.plan} activado para el tenant.`,
      tenantId: proof.tenantId,
      plan: dbPlan,
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminPaymentProofImage(req, res, next) {
  try {
    assertAdminPassword(req);

    const { proofId } = req.params;
    if (!proofId) throw new ValidationError('proofId es requerido');

    const file = await downloadPaymentProof(proofId);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.send(file.buffer);
  } catch (error) {
    return next(error);
  }
}

async function rejectPaymentProof(req, res, next) {
  try {
    assertAdminPassword(req);

    const { proofId } = req.params;
    if (!proofId) throw new ValidationError('proofId es requerido');

    // Mark proof as rejected in Google Drive
    await updatePaymentProofStatus(proofId, 'rejected');

    logger.info({ proofId }, 'Payment proof rejected');

    return res.json({
      success: true,
      message: 'Comprobante rechazado',
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createPaymentProof,
  getAdminPaymentProofs,
  approvePaymentProof,
  rejectPaymentProof,
  getAdminPaymentProofImage,
};
