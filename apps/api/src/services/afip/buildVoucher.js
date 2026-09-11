const { ValidationError } = require('../../errors');

// Tipos de comprobante WSFE. Sólo facturas: las notas de crédito/débito
// (2/3, 7/8, 12/13) no tienen flujo todavía.
const CBTE_TIPO = { A: 1, B: 6, C: 11 };

// Documento del receptor.
const DOC_TIPO = { CUIT: 80, DNI: 96, SIN_IDENTIFICAR: 99 };

// Condición frente al IVA del receptor. Obligatorio desde la RG 5616: sin este
// campo AFIP rechaza el comprobante, sea A, B o C.
const COND_IVA = { RESPONSABLE_INSCRIPTO: 1, CONSUMIDOR_FINAL: 5 };

const IVA_21_ID = 5;   // id de alícuota 21% en la tabla de AFIP
const CONCEPTO_SERVICIOS = 2;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toAfipDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// El formato de CAEFchVto no es estable entre versiones del SDK, así que
// aceptamos las dos formas y normalizamos a ISO para guardar en Postgres.
function parseAfipDate(value) {
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  throw new ValidationError(`Fecha de AFIP con formato inesperado: ${s}`);
}

function assertTipoPermitido(situacionFiscal, cbteTipo) {
  if (situacionFiscal === 'monotributo' && cbteTipo !== CBTE_TIPO.C) {
    throw new ValidationError('Un monotributo sólo puede emitir factura C.');
  }
  if (situacionFiscal === 'responsable_inscripto' && cbteTipo === CBTE_TIPO.C) {
    throw new ValidationError('Un responsable inscripto emite factura A o B, no C.');
  }
  if (![CBTE_TIPO.A, CBTE_TIPO.B, CBTE_TIPO.C].includes(cbteTipo)) {
    throw new ValidationError(`Tipo de comprobante no soportado: ${cbteTipo}`);
  }
}

// Devuelve { DocTipo, DocNro, CondicionIVAReceptorId } según el tipo y los datos
// del receptor. La A exige CUIT; B y C caen en consumidor final si no hay DNI.
function buildReceptor(cbteTipo, { receptorCuit, receptorDni }) {
  if (cbteTipo === CBTE_TIPO.A) {
    const cuit = String(receptorCuit || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(cuit)) {
      throw new ValidationError('La factura A requiere el CUIT del receptor (11 dígitos).');
    }
    return {
      DocTipo: DOC_TIPO.CUIT,
      DocNro: Number(cuit),
      CondicionIVAReceptorId: COND_IVA.RESPONSABLE_INSCRIPTO,
    };
  }

  const dni = String(receptorDni || '').replace(/\D/g, '');
  if (dni) {
    return {
      DocTipo: DOC_TIPO.DNI,
      DocNro: Number(dni),
      CondicionIVAReceptorId: COND_IVA.CONSUMIDOR_FINAL,
    };
  }

  // AFIP exige identificar al receptor en facturas B por encima de cierto monto,
  // pero ese umbral cambia por resolución. No lo hardcodeamos: si el monto lo
  // supera, AFIP rechaza y el mensaje se le muestra al usuario tal cual.
  return {
    DocTipo: DOC_TIPO.SIN_IDENTIFICAR,
    DocNro: 0,
    CondicionIVAReceptorId: COND_IVA.CONSUMIDOR_FINAL,
  };
}

// La C no discrimina IVA. Mandar el array Iva en una C — o omitirlo en una A/B
// con importe > 0 — devuelve el error 10070 de AFIP.
function buildImportes(cbteTipo, total) {
  if (cbteTipo === CBTE_TIPO.C) {
    return { ImpNeto: total, ImpIVA: 0 };
  }
  const neto = round2(total / 1.21);
  // El IVA sale por resta y no por multiplicación, para que neto + iva dé
  // exactamente el total y AFIP no rechace por diferencia de un centavo.
  const iva = round2(total - neto);
  return {
    ImpNeto: neto,
    ImpIVA: iva,
    Iva: [{ Id: IVA_21_ID, BaseImp: neto, Importe: iva }],
  };
}

/**
 * Arma el objeto WSFE para createNextVoucher. Función pura: sin red, sin base
 * de datos. CbteDesde/CbteHasta los completa createNextVoucher.
 */
function buildVoucher(config, input) {
  const { cbteTipo, total, cbteFecha, servDesde, servHasta, vtoPago } = input;

  assertTipoPermitido(config.situacionFiscal, cbteTipo);

  const importe = round2(Number(total));
  if (!Number.isFinite(importe) || importe <= 0) {
    throw new ValidationError('El monto debe ser mayor a cero.');
  }

  const receptor = buildReceptor(cbteTipo, input);
  const importes = buildImportes(cbteTipo, importe);

  return {
    CantReg: 1,
    PtoVta: config.puntoVenta,
    CbteTipo: cbteTipo,
    Concepto: CONCEPTO_SERVICIOS,
    ...receptor,
    CbteFch: toAfipDate(cbteFecha),
    ImpTotal: importe,
    ImpTotConc: 0,
    ImpOpEx: 0,
    ImpTrib: 0,
    ...importes,
    // Concepto 2 (servicios) obliga a informar el período y el vencimiento.
    FchServDesde: toAfipDate(servDesde),
    FchServHasta: toAfipDate(servHasta),
    FchVtoPago: toAfipDate(vtoPago),
    MonId: 'PES',
    MonCotiz: 1,
  };
}

module.exports = { buildVoucher, toAfipDate, parseAfipDate, CBTE_TIPO, DOC_TIPO, COND_IVA };
