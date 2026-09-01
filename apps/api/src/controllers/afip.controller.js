const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError, ValidationError, NotFoundError } = require('../errors');
const { encrypt, decrypt } = require('../utils/crypto');
const { emitirComprobante } = require('../services/afip');
const { CBTE_TIPO } = require('../services/afip/buildVoucher');
const { renderComprobante } = require('../services/afip/comprobanteHtml');
const logger = require('../config/logger');

// Campos de configuración que el cliente puede escribir. cert/key quedan fuera
// a propósito: se manejan aparte porque van cifrados.
const CONFIG_FIELDS = [
  'cuit', 'situacion_fiscal', 'punto_venta', 'razon_social',
  'domicilio_comercial', 'ingresos_brutos', 'fecha_inicio_actividades', 'production',
];

const CONFIG_SELECT = `tenant_id, ${CONFIG_FIELDS.join(', ')}, cert_encrypted, key_encrypted`;

// El certificado nunca sale de la API. El cliente sólo sabe si está cargado.
function stripCert(row) {
  const data = convertKeys(row);
  data.certConfigured = Boolean(data.certEncrypted && data.keyEncrypted);
  delete data.certEncrypted;
  delete data.keyEncrypted;
  return data;
}

async function getConfig(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('afip_config')
      .select(CONFIG_SELECT)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.json({ success: true, data: { configured: false, certConfigured: false } });
    }

    return res.json({ success: true, data: { ...stripCert(data), configured: true } });
  } catch (err) { return next(err); }
}

async function updateConfig(req, res, next) {
  try {
    const updates = {};
    for (const field of CONFIG_FIELDS) {
      const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (camel in req.body) updates[field] = req.body[camel];
    }

    if (updates.cuit !== undefined) {
      const cuit = String(updates.cuit).replace(/\D/g, '');
      if (!/^\d{11}$/.test(cuit)) throw new ValidationError('El CUIT debe tener 11 dígitos.');
      updates.cuit = Number(cuit);
    }

    if (updates.situacion_fiscal !== undefined
        && !['monotributo', 'responsable_inscripto'].includes(updates.situacion_fiscal)) {
      throw new ValidationError('Situación fiscal inválida.');
    }

    if (updates.punto_venta !== undefined) {
      const pv = Number(updates.punto_venta);
      if (!Number.isInteger(pv) || pv <= 0) throw new ValidationError('Punto de venta inválido.');
      updates.punto_venta = pv;
    }

    // cert/key llegan sólo cuando el usuario los carga o los reemplaza.
    if (req.body.cert) updates.cert_encrypted = encrypt(req.body.cert);
    if (req.body.key) updates.key_encrypted = encrypt(req.body.key);

    if (!Object.keys(updates).length) throw new AppError('No hay campos para actualizar.', 400);

    // En el primer guardado de un tenant no hay fila previa: si el caller
    // (frontend o no) omite alguna columna NOT NULL, el upsert la INSERTa sin
    // valor y Postgres tira un 500 crudo. Se valida acá para devolver un 422
    // accionable antes de llegar a la base.
    const { data: existing, error: existingError } = await supabase
      .from('afip_config')
      .select('tenant_id')
      .eq('tenant_id', req.tenantId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existing) {
      const REQUIRED_ON_INSERT = {
        cuit: 'El CUIT', situacion_fiscal: 'La situación fiscal',
        punto_venta: 'El punto de venta', razon_social: 'La razón social',
      };
      for (const [field, label] of Object.entries(REQUIRED_ON_INSERT)) {
        if (updates[field] === undefined || updates[field] === null || updates[field] === '') {
          throw new ValidationError(`${label} es obligatoria para guardar la configuración de AFIP.`);
        }
      }
    }

    updates.tenant_id = req.tenantId;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('afip_config')
      .upsert(updates, { onConflict: 'tenant_id' })
      .select(CONFIG_SELECT)
      .single();

    if (error) throw error;
    return res.json({ success: true, data: { ...stripCert(data), configured: true } });
  } catch (err) { return next(err); }
}

// Carga la config y desencripta cert/key en memoria. El resultado no se
// persiste ni se loguea en ningún caso.
async function loadEmisor(tenantId) {
  const { data, error } = await supabase
    .from('afip_config')
    .select(CONFIG_SELECT)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ValidationError('Configurá primero los datos de AFIP en Ajustes.');
  if (!data.cert_encrypted || !data.key_encrypted) {
    throw new ValidationError('Falta cargar el certificado de AFIP en Ajustes.');
  }

  return {
    tenantId,
    cuit: data.cuit,
    situacionFiscal: data.situacion_fiscal,
    puntoVenta: data.punto_venta,
    production: data.production,
    razonSocial: data.razon_social,
    domicilioComercial: data.domicilio_comercial,
    ingresosBrutos: data.ingresos_brutos,
    fechaInicioActividades: data.fecha_inicio_actividades,
    cert: decrypt(data.cert_encrypted),
    key: decrypt(data.key_encrypted),
  };
}

function parseFecha(value, fallback) {
  if (!value) return fallback;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Fecha inválida: ${value}`);
  return d;
}

async function listInvoices(req, res, next) {
  try {
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (req.query.appointmentId) query = query.eq('appointment_id', req.query.appointmentId);

    // Clampea contra valores negativos/basura (ej. ?limit=-5) para que nunca
    // llegue un rango inválido a .range() y produzca un 500.
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, data: convertKeys(data || []) });
  } catch (err) { return next(err); }
}

async function createInvoice(req, res, next) {
  try {
    const b = req.body || {};

    const cbteTipo = Number(b.cbteTipo);
    if (![CBTE_TIPO.A, CBTE_TIPO.B, CBTE_TIPO.C].includes(cbteTipo)) {
      throw new ValidationError('Tipo de comprobante inválido.');
    }

    const total = Number(b.total);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('El monto debe ser mayor a cero.');
    }

    const detalle = String(b.detalle || '').trim();
    if (!detalle) throw new ValidationError('Cargá un detalle para el comprobante.');

    const emisor = await loadEmisor(req.tenantId);

    const hoy = new Date();
    const input = {
      cbteTipo,
      total,
      receptorCuit: b.receptorCuit,
      receptorDni: b.receptorDni,
      cbteFecha: parseFecha(b.cbteFecha, hoy),
      servDesde: parseFecha(b.servDesde, hoy),
      servHasta: parseFecha(b.servHasta, hoy),
      vtoPago:   parseFecha(b.vtoPago, hoy),
    };

    const { cae, caeVto, numero, voucher } = await emitirComprobante(emisor, input);

    const row = {
      tenant_id: req.tenantId,
      contact_id: b.contactId || null,
      appointment_id: b.appointmentId || null,
      cbte_tipo: cbteTipo,
      punto_venta: emisor.puntoVenta,
      numero,
      cbte_fecha: voucher.CbteFch.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      concepto: voucher.Concepto,
      doc_tipo: voucher.DocTipo,
      doc_nro: voucher.DocNro,
      receptor_nombre: b.receptorNombre || null,
      condicion_iva_receptor_id: voucher.CondicionIVAReceptorId,
      detalle,
      imp_total: voucher.ImpTotal,
      imp_neto: voucher.ImpNeto,
      imp_iva: voucher.ImpIVA,
      cae,
      cae_vto: caeVto,
      production: emisor.production,
      // Congela los datos del emisor para poder reimprimir el comprobante tal
      // como salió, aunque después edite su configuración.
      emisor_snapshot: {
        cuit: emisor.cuit,
        situacionFiscal: emisor.situacionFiscal,
        razonSocial: emisor.razonSocial,
        domicilioComercial: emisor.domicilioComercial,
        ingresosBrutos: emisor.ingresosBrutos,
        fechaInicioActividades: emisor.fechaInicioActividades,
      },
    };

    const { data, error } = await supabase.from('invoices').insert(row).select().single();

    if (error) {
      // El CAE ya existe del lado de AFIP: el comprobante está emitido aunque no
      // lo hayamos podido guardar. Se loguea entero para poder recuperarlo a mano.
      logger.error({
        err: error.message, tenantId: req.tenantId,
        cae, caeVto, numero, puntoVenta: emisor.puntoVenta, cbteTipo,
      }, 'afip_invoice_persist_failed_after_cae');
      throw new AppError(
        `El comprobante se emitió en AFIP (CAE ${cae}) pero no se pudo guardar. Contactá a soporte con ese número.`,
        500,
      );
    }

    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getComprobante(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundError('Comprobante no encontrado');

    const html = await renderComprobante(convertKeys(data));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(html);
  } catch (err) { return next(err); }
}

module.exports = { getConfig, updateConfig, listInvoices, createInvoice, getComprobante };
