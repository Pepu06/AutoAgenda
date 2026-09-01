'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { getToken } from '../../../lib/auth';
import styles from './facturacion.module.css';

const NOMBRE_TIPO = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function formatMoney(value) {
  return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function FacturacionPage() {
  const [invoices, setInvoices] = useState([]);
  const [afipConfigured, setAfipConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/afip/invoices'), api.get('/afip/config')])
      .then(([inv, cfg]) => {
        setInvoices(inv.data || []);
        setAfipConfigured(Boolean(cfg.data?.certConfigured));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // El comprobante se pide con el header Authorization y se escribe en una
  // pestaña nueva. No se navega directo a la URL porque eso obligaría a mandar
  // el token por query string, y auth.js sólo lo permite en el stream SSE del
  // QR justamente para que no se filtre a logs y Referer.
  // La ventana se abre ANTES del await: si se abriera después, el bloqueador de
  // popups la descartaría por no venir de un gesto directo del usuario.
  async function abrirComprobante(id) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<p style="font-family:sans-serif">Generando comprobante…</p>');

    try {
      const res = await fetch(`${API_URL}/afip/invoices/${id}/comprobante`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('No se pudo generar el comprobante');
      const html = await res.text();
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      win.document.body.textContent = err.message;
    }
  }

  if (loading) return <p className={styles.state}>Cargando…</p>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Facturación</h1>
        <Link href="/facturacion/nueva" className={styles.primary}>Nueva factura</Link>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {!afipConfigured && (
        <p className={styles.warning}>
          Todavía no cargaste el certificado de AFIP.{' '}
          <Link href="/settings">Configurarlo en Ajustes</Link>
        </p>
      )}

      {invoices.length === 0 ? (
        <p className={styles.state}>Todavía no emitiste ninguna factura.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th><th>Tipo</th><th>Número</th><th>Receptor</th>
              <th className={styles.num}>Total</th><th>CAE</th><th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{formatDate(inv.cbteFecha)}</td>
                <td>
                  {NOMBRE_TIPO[inv.cbteTipo]}
                  {!inv.production && <span className={styles.badge}>prueba</span>}
                </td>
                <td>
                  {String(inv.puntoVenta).padStart(5, '0')}-{String(inv.numero).padStart(8, '0')}
                </td>
                <td>{inv.receptorNombre || 'Consumidor Final'}</td>
                <td className={styles.num}>{formatMoney(inv.impTotal)}</td>
                <td>{inv.cae}</td>
                <td>
                  <button type="button" onClick={() => abrirComprobante(inv.id)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
