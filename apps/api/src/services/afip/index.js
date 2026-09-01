const { Arca, AccessTicket } = require('@arcasdk/core');
const { buildVoucher, parseAfipDate, CBTE_TIPO } = require('./buildVoucher');
const { createTicketStorage } = require('./ticketStorage');
const { AppError, ValidationError } = require('../../errors');
const logger = require('../../config/logger');

// El paquete es CommonJS (salida de tsc), así que un require normal alcanza.
// La instancia igual se arma por request y no al bootear: depende del
// certificado del tenant, que sólo existe desencriptado en memoria y por el
// tiempo que dura la emisión.
function getArcaInstance(config) {
  if (!config.cuit) throw new ValidationError('Falta el CUIT del emisor.');
  if (!config.cert || !config.key) {
    throw new ValidationError('Falta cargar el certificado y la clave de AFIP.');
  }

  return new Arca({
    cuit: Number(config.cuit),
    cert: config.cert,
    key: config.key,
    production: Boolean(config.production),
    ticketStorage: createTicketStorage({
      tenantId: config.tenantId,
      production: Boolean(config.production),
      AccessTicket,
    }),
  });
}

// El SDK NO lanza excepción cuando AFIP rechaza: devuelve cae: "" y deja el
// detalle en response.Errors.Err y en Observaciones.Obs. Sin este chequeo
// guardaríamos una factura con CAE vacío y le diríamos al usuario que se emitió.
function assertAceptado(result) {
  if (result?.cae) return;

  const det = result?.response?.FeDetResp?.FECAEDetResponse?.[0];
  const mensajes = [
    ...(result?.response?.Errors?.Err ?? []),
    ...(det?.Observaciones?.Obs ?? []),
  ]
    .map((e) => `${e.Code}: ${e.Msg}`)
    .filter(Boolean);

  const detalle = mensajes.length ? mensajes.join(' | ') : 'sin detalle';
  throw new AppError(`AFIP rechazó el comprobante — ${detalle}`, 400);
}

/**
 * Emite un comprobante y devuelve el CAE. No escribe en la base: eso es
 * responsabilidad del controller, que hace un solo INSERT en invoices.
 *
 * ponytail: createNextVoucher hace getLastVoucher+1 internamente y esa secuencia
 * no es atómica del lado de AFIP. Dos emisiones simultáneas sobre el mismo punto
 * de venta pueden pedir el mismo número; AFIP rechaza la segunda (error 10016)
 * sin duplicar CAE ni corromper nada, y el usuario reintenta. Si esto llegara a
 * ser un problema real (varios operadores facturando a la vez), el upgrade es un
 * lock distribuido en Redis — ioredis ya está disponible vía BullMQ.
 */
async function emitirComprobante(config, input) {
  const voucher = buildVoucher(config, input);
  const arca = getArcaInstance(config);

  const result = await arca.electronicBillingService.createNextVoucher(voucher);
  assertAceptado(result);

  const numero = result?.response?.FeDetResp?.FECAEDetResponse?.[0]?.CbteDesde;
  if (!numero) {
    throw new AppError('AFIP no devolvió el número de comprobante.', 502);
  }

  return {
    cae: result.cae,
    caeVto: parseAfipDate(result.caeFchVto),
    numero: Number(numero),
    voucher,
  };
}

module.exports = { emitirComprobante, getArcaInstance, CBTE_TIPO, logger };
