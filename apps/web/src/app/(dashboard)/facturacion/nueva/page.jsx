'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import styles from './nueva.module.css';

const CBTE = { A: 1, B: 6, C: 11 };

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

// useSearchParams() necesita un límite de Suspense arriba, si no `next build`
// falla al prerenderizar (mismo patrón que (dashboard)/billing/success).
function NuevaFacturaContent() {
  const router = useRouter();
  const params = useSearchParams();
  const appointmentId = params.get('appointmentId');

  const [config, setConfig] = useState(null);
  const [cbteTipo, setCbteTipo] = useState(null);
  const [prefill, setPrefill] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/afip/config')
      .then((res) => {
        setConfig(res.data);
        // Un monotributo sólo puede emitir C: no tiene sentido preguntarle.
        if (res.data.situacionFiscal === 'monotributo') setCbteTipo(CBTE.C);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!appointmentId) return;
    api.get(`/appointments/${appointmentId}`)
      .then((res) => {
        const a = res.data;
        setPrefill({
          contactId: a.contact?.id,
          receptorNombre: a.contact?.name || '',
          receptorDni: a.contact?.dni || '',
          detalle: a.service?.name || '',
          total: a.service?.price || '',
          fecha: String(a.scheduledAt || '').slice(0, 10) || hoyIso(),
        });
      })
      .catch(() => { /* la precarga es una comodidad: si falla, se carga a mano */ });
  }, [appointmentId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const body = {
      cbteTipo,
      total: Number(form.get('total')),
      detalle: String(form.get('detalle') || '').trim(),
      receptorNombre: form.get('receptorNombre') || null,
      receptorDni: form.get('receptorDni') || null,
      receptorCuit: form.get('receptorCuit') || null,
      cbteFecha: form.get('cbteFecha'),
      servDesde: form.get('servDesde'),
      servHasta: form.get('servHasta'),
      vtoPago: form.get('vtoPago'),
      contactId: prefill.contactId || null,
      appointmentId: appointmentId || null,
    };

    try {
      await api.post('/afip/invoices', body);
      router.push('/facturacion');
    } catch (err) {
      // Los mensajes de AFIP son accionables ("punto de venta no habilitado"),
      // así que se muestran tal cual vienen.
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (!config) return <p className={styles.state}>Cargando…</p>;

  if (!config.certConfigured) {
    return (
      <main className={styles.page}>
        <h1>Nueva factura</h1>
        <p className={styles.warning}>
          Antes de facturar tenés que cargar tu certificado de AFIP en Ajustes.
        </p>
      </main>
    );
  }

  const esInscripto = config.situacionFiscal === 'responsable_inscripto';

  // Paso 1: elegir el tipo. Un monotributo se lo saltea (ya quedó fijado en C).
  if (!cbteTipo) {
    return (
      <main className={styles.page}>
        <h1>Nueva factura</h1>
        <p>¿Qué comprobante querés emitir?</p>
        <div className={styles.tipos}>
          <button type="button" onClick={() => setCbteTipo(CBTE.A)}>
            <strong>Factura A</strong>
            <span>A un responsable inscripto. Requiere su CUIT.</span>
          </button>
          <button type="button" onClick={() => setCbteTipo(CBTE.B)}>
            <strong>Factura B</strong>
            <span>A consumidor final o exento. El DNI es opcional.</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1>Nueva factura {cbteTipo === CBTE.A ? 'A' : cbteTipo === CBTE.B ? 'B' : 'C'}</h1>

      {esInscripto && (
        <button type="button" className={styles.link} onClick={() => setCbteTipo(null)}>
          ← Cambiar tipo de comprobante
        </button>
      )}

      {!config.production && (
        <p className={styles.warning}>
          Ambiente de prueba: el comprobante no tiene validez fiscal.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <label>Nombre del receptor
          <input name="receptorNombre" defaultValue={prefill.receptorNombre || ''} />
        </label>

        {cbteTipo === CBTE.A ? (
          <label>CUIT del receptor
            <input name="receptorCuit" placeholder="30111111118" required />
          </label>
        ) : (
          <label>DNI del receptor (opcional)
            <input name="receptorDni" defaultValue={prefill.receptorDni || ''} />
          </label>
        )}

        <label>Detalle
          <input name="detalle" defaultValue={prefill.detalle || ''}
                 placeholder="Sesión de coaching" required />
        </label>

        <label>Monto total (IVA incluido)
          <input name="total" type="number" step="0.01" min="0.01"
                 defaultValue={prefill.total || ''} required />
        </label>

        <label>Fecha del comprobante
          <input name="cbteFecha" type="date" defaultValue={prefill.fecha || hoyIso()} required />
        </label>

        <fieldset>
          <legend>Período del servicio</legend>
          <label>Desde
            <input name="servDesde" type="date" defaultValue={prefill.fecha || hoyIso()} required />
          </label>
          <label>Hasta
            <input name="servHasta" type="date" defaultValue={prefill.fecha || hoyIso()} required />
          </label>
          <label>Vencimiento de pago
            <input name="vtoPago" type="date" defaultValue={hoyIso()} required />
          </label>
        </fieldset>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Emitiendo…' : 'Emitir factura'}
        </button>
      </form>
    </main>
  );
}

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<p className={styles.state}>Cargando…</p>}>
      <NuevaFacturaContent />
    </Suspense>
  );
}
