const QRCode = require('qrcode');

const LETRA = { 1: 'A', 6: 'B', 11: 'C' };
const NOMBRE_TIPO = { 1: 'FACTURA A', 6: 'FACTURA B', 11: 'FACTURA C' };
const NOMBRE_DOC = { 80: 'CUIT', 96: 'DNI', 99: 'Consumidor Final' };
const NOMBRE_COND_IVA = { 1: 'IVA Responsable Inscripto', 5: 'Consumidor Final' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatMoney(value) {
  return Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Payload del QR de verificación, con el formato que fija AFIP (RG 4892).
 * Los nombres de campo no son negociables: si uno cambia, el QR no resuelve.
 */
function buildQrPayload(invoice) {
  return {
    ver: 1,
    fecha: String(invoice.cbteFecha).slice(0, 10),
    cuit: Number(invoice.emisorSnapshot.cuit),
    ptoVta: Number(invoice.puntoVenta),
    tipoCmp: Number(invoice.cbteTipo),
    nroCmp: Number(invoice.numero),
    importe: Number(invoice.impTotal),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(invoice.docTipo),
    nroDocRec: Number(invoice.docNro),
    tipoCodAut: 'E',
    codAut: Number(invoice.cae),
  };
}

function buildQrUrl(invoice) {
  const payload = Buffer.from(JSON.stringify(buildQrPayload(invoice))).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${payload}`;
}

/**
 * Comprobante como página HTML imprimible. No se genera un PDF en el servidor
 * a propósito: cualquier renderer HTML->PDF trae un Chromium, que rompe el
 * build de Railway. El usuario hace "Imprimir -> Guardar como PDF" desde el
 * navegador. AFIP regula qué tiene que contener el comprobante, no el formato
 * de archivo con el que se entrega.
 */
async function renderComprobante(invoice) {
  const qrDataUri = await QRCode.toDataURL(buildQrUrl(invoice), { margin: 1, width: 200 });
  const emisor = invoice.emisorSnapshot;
  const letra = LETRA[invoice.cbteTipo] || '';
  const esC = invoice.cbteTipo === 11;
  const numeroFormateado = `${String(invoice.puntoVenta).padStart(5, '0')}-${String(invoice.numero).padStart(8, '0')}`;
  const receptorDoc = invoice.docTipo === 99
    ? 'Consumidor Final'
    : `${NOMBRE_DOC[invoice.docTipo] || 'Doc'}: ${invoice.docNro}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(NOMBRE_TIPO[invoice.cbteTipo])} ${escapeHtml(numeroFormateado)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111;
         background: #f4f4f5; margin: 0; padding: 24px; }
  .hoja { max-width: 780px; margin: 0 auto; background: #fff; padding: 32px;
          border: 1px solid #d4d4d8; }
  .encabezado { display: flex; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .emisor, .comprobante { flex: 1; }
  .comprobante { text-align: right; }
  .letra { display: inline-block; border: 2px solid #111; font-size: 40px;
           font-weight: 700; width: 64px; text-align: center; line-height: 1.1; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .dato { font-size: 13px; color: #3f3f46; margin: 2px 0; }
  .seccion { margin-top: 24px; }
  .seccion h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
                color: #71717a; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; background: #f4f4f5; padding: 8px; font-size: 12px;
       text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 10px 8px; border-bottom: 1px solid #e4e4e7; }
  .num { text-align: right; }
  .totales { margin-top: 16px; margin-left: auto; width: 280px; font-size: 14px; }
  .totales div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totales .total { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px;
                    font-size: 18px; font-weight: 700; }
  .pie { margin-top: 32px; display: flex; gap: 24px; align-items: center;
         border-top: 1px solid #e4e4e7; padding-top: 16px; }
  .pie img { width: 120px; height: 120px; }
  .cae { font-size: 14px; }
  .cae strong { font-size: 18px; letter-spacing: .04em; }
  .acciones { max-width: 780px; margin: 0 auto 16px; }
  button { font: inherit; padding: 10px 18px; border: 1px solid #111; background: #111;
           color: #fff; border-radius: 6px; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .hoja { border: 0; padding: 0; max-width: none; }
    .acciones { display: none; }
  }
</style>
</head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
  <div class="hoja">
    <div class="encabezado">
      <div class="emisor">
        <h1>${escapeHtml(emisor.razonSocial)}</h1>
        <p class="dato">${escapeHtml(emisor.domicilioComercial || '')}</p>
        <p class="dato">CUIT: ${escapeHtml(emisor.cuit)}</p>
        ${emisor.ingresosBrutos ? `<p class="dato">Ingresos Brutos: ${escapeHtml(emisor.ingresosBrutos)}</p>` : ''}
        ${emisor.fechaInicioActividades ? `<p class="dato">Inicio de actividades: ${escapeHtml(formatDate(emisor.fechaInicioActividades))}</p>` : ''}
      </div>
      <div class="comprobante">
        <div class="letra">${escapeHtml(letra)}</div>
        <h1>${escapeHtml(NOMBRE_TIPO[invoice.cbteTipo])}</h1>
        <p class="dato">N° ${escapeHtml(numeroFormateado)}</p>
        <p class="dato">Fecha: ${escapeHtml(formatDate(invoice.cbteFecha))}</p>
      </div>
    </div>

    <div class="seccion">
      <h2>Receptor</h2>
      <p class="dato">${escapeHtml(invoice.receptorNombre || 'Consumidor Final')}</p>
      <p class="dato">${escapeHtml(receptorDoc)}</p>
      <p class="dato">Condición frente al IVA: ${escapeHtml(NOMBRE_COND_IVA[invoice.condicionIvaReceptorId] || '-')}</p>
    </div>

    <div class="seccion">
      <h2>Detalle</h2>
      <table>
        <thead><tr><th>Concepto</th><th class="num">Importe</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(invoice.detalle)}</td>
            <td class="num">$ ${escapeHtml(formatMoney(invoice.impTotal))}</td>
          </tr>
        </tbody>
      </table>

      <div class="totales">
        ${esC ? '' : `
        <div><span>Neto gravado</span><span>$ ${escapeHtml(formatMoney(invoice.impNeto))}</span></div>
        <div><span>IVA 21%</span><span>$ ${escapeHtml(formatMoney(invoice.impIva))}</span></div>`}
        <div class="total"><span>Total</span><span>$ ${escapeHtml(formatMoney(invoice.impTotal))}</span></div>
      </div>
    </div>

    <div class="pie">
      <img src="${qrDataUri}" alt="Código QR de verificación AFIP">
      <div class="cae">
        <p class="dato">CAE N°</p>
        <p><strong>${escapeHtml(invoice.cae)}</strong></p>
        <p class="dato">Vencimiento del CAE: ${escapeHtml(formatDate(invoice.caeVto))}</p>
        ${invoice.production ? '' : '<p class="dato"><strong>COMPROBANTE EMITIDO EN AMBIENTE DE PRUEBA — SIN VALIDEZ FISCAL</strong></p>'}
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderComprobante, buildQrPayload, buildQrUrl };
