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

// AFIP a veces devuelve un único objeto en vez de un array cuando sólo hay un
// error/observación (cardinalidad del WSDL). Normaliza ambos casos a array.
function asArray(x) {
  return [].concat(x ?? []);
}

// El SDK NO lanza excepción cuando AFIP rechaza: devuelve cae: "" y deja el
// detalle en response.Errors.Err y en Observaciones.Obs. Sin este chequeo
// guardaríamos una factura con CAE vacío y le diríamos al usuario que se emitió.
function assertAceptado(result) {
  if (result?.cae) return;

  const det = result?.response?.FeDetResp?.FECAEDetResponse?.[0];
  const mensajes = [
    ...asArray(result?.response?.Errors?.Err),
    ...asArray(det?.Observaciones?.Obs),
  ]
    // Sin Code ni Msg no hay nada útil que mostrar — mejor omitirlo que
    // mandarle al usuario el literal "undefined: undefined".
    .filter((e) => e && (e.Code !== undefined || e.Msg !== undefined))
    .map((e) => `${e.Code}: ${e.Msg}`);

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

  // Todo lo que createNextVoucher puede tirar (WSAA rechazado, SOAP roto, red
  // caída, cert/key inválidos) llegaba como Internal Server Error genérico.
  // Se traduce a un mensaje accionable, salvo que ya sea un AppError nuestro.
  let result;
  try {
    result = await arca.electronicBillingService.createNextVoucher(voucher);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`No se pudo conectar con AFIP: ${err.message}`, 502);
  }

  assertAceptado(result);

  const numero = result?.response?.FeDetResp?.FECAEDetResponse?.[0]?.CbteDesde;
  if (!numero) {
    // AFIP ya aceptó el comprobante (hay CAE) pero no pudimos leer el número —
    // se loguea para poder recuperarlo a mano, igual que el INSERT fallido.
    logger.error(
      { tenantId: config.tenantId, cae: result.cae, caeVto: result.caeFchVto },
      'afip_voucher_number_or_date_parse_failed',
    );
    throw new AppError('AFIP no devolvió el número de comprobante.', 502);
  }

  let caeVto;
  try {
    caeVto = parseAfipDate(result.caeFchVto);
  } catch (err) {
    logger.error(
      { tenantId: config.tenantId, cae: result.cae, caeVto: result.caeFchVto },
      'afip_voucher_number_or_date_parse_failed',
    );
    throw err;
  }

  return {
    cae: result.cae,
    caeVto,
    numero: Number(numero),
    voucher,
  };
}

module.exports = { emitirComprobante, getArcaInstance, CBTE_TIPO, logger };
