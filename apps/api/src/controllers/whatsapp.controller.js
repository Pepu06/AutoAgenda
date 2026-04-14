const { supabase } = require('@autoagenda/db');
const { verifyPhoneNumber, exchangeCodeForUserToken, listUserPhoneNumbers } = require('../services/whatsappOnboarding');
const { AppError, ValidationError } = require('../errors');
const logger = require('../config/logger');
const env = require('../config/env');

async function connectStatus(req, res, next) {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('whatsapp_phone_number_id, whatsapp_display_number, whatsapp_coexistence_status, whatsapp_connected_at')
      .eq('id', req.tenantId)
      .single();

    const connected = !!tenant?.whatsapp_phone_number_id;
    return res.json({
      success: true,
      data: {
        connected,
        phoneNumberId:    tenant?.whatsapp_phone_number_id || null,
        displayNumber:    tenant?.whatsapp_display_number || null,
        coexistenceStatus: tenant?.whatsapp_coexistence_status || 'not_connected',
        connectedAt:      tenant?.whatsapp_connected_at || null,
      },
    });
  } catch (err) { return next(err); }
}

async function connectManual(req, res, next) {
  try {
    const { phoneNumberId } = req.body;
    if (!phoneNumberId) throw new ValidationError('phoneNumberId es requerido');

    // Validate the number exists in our WABA and get display info
    let phoneInfo;
    try {
      phoneInfo = await verifyPhoneNumber(phoneNumberId);
    } catch (err) {
      throw new AppError(`No se pudo verificar el número en Meta: ${err.message}`, 400);
    }

    await supabase.from('tenants').update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_display_number: phoneInfo.display_phone_number || null,
      whatsapp_coexistence_status: 'active',
      whatsapp_connected_at: new Date().toISOString(),
      // Clear per-tenant token — billing goes through central META_SYSTEM_USER_TOKEN
      whatsapp_access_token: null,
    }).eq('id', req.tenantId);

    logger.info({ tenantId: req.tenantId, phoneNumberId }, '[WhatsApp] Manual connection saved');

    return res.json({
      success: true,
      data: {
        phoneNumberId,
        displayNumber: phoneInfo.display_phone_number || null,
        verifiedName:  phoneInfo.verified_name || null,
      },
    });
  } catch (err) { return next(err); }
}

async function connectEmbeddedSignup(req, res, next) {
  try {
    if (!env.META_APP_ID || !env.META_APP_SECRET) {
      throw new AppError('Embedded Signup no está configurado en este servidor', 501);
    }

    const { code, redirectUri } = req.body;
    if (!code) throw new ValidationError('code es requerido');

    // Exchange code for user token
    let userToken;
    try {
      userToken = await exchangeCodeForUserToken(code, redirectUri);
    } catch (err) {
      throw new AppError(`Error al autenticar con Meta: ${err.message}`, 400);
    }

    // List phone numbers the user authorized
    let phones;
    try {
      phones = await listUserPhoneNumbers(userToken);
    } catch (err) {
      throw new AppError(`Error al obtener números de Meta: ${err.message}`, 400);
    }

    if (!phones.length) {
      throw new AppError('No se encontraron números de WhatsApp en tu cuenta de Meta', 400);
    }

    // Use first phone number (single-number onboarding flow)
    const phone = phones[0];

    await supabase.from('tenants').update({
      whatsapp_phone_number_id: phone.id,
      whatsapp_display_number: phone.display_phone_number || null,
      whatsapp_waba_id: phone.wabaId || null,
      whatsapp_coexistence_status: 'active',
      whatsapp_connected_at: new Date().toISOString(),
      whatsapp_access_token: null,
    }).eq('id', req.tenantId);

    logger.info({ tenantId: req.tenantId, phoneNumberId: phone.id }, '[WhatsApp] Embedded Signup connection saved');

    return res.json({
      success: true,
      data: {
        phoneNumberId: phone.id,
        displayNumber: phone.display_phone_number || null,
        verifiedName:  phone.verified_name || null,
      },
    });
  } catch (err) { return next(err); }
}

async function disconnect(req, res, next) {
  try {
    await supabase.from('tenants').update({
      whatsapp_phone_number_id: null,
      whatsapp_display_number:  null,
      whatsapp_waba_id:         null,
      whatsapp_coexistence_status: 'disconnected',
    }).eq('id', req.tenantId);

    logger.info({ tenantId: req.tenantId }, '[WhatsApp] Disconnected');
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

module.exports = { connectStatus, connectManual, connectEmbeddedSignup, disconnect };
