'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './settings.module.css';

export default function WhatsappSection() {
  const [status, setStatus] = useState(null);   // null = loading
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [showManual, setShowManual] = useState(false);

  async function loadStatus() {
    try {
      const res = await api.get('/whatsapp/status');
      setStatus(res.data);
    } catch {
      setStatus({ connected: false });
    }
  }

  useEffect(() => {
    loadStatus();
    // Preload FB SDK if Embedded Signup is configured
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (appId && typeof window !== 'undefined' && !window.FB) {
      window.fbAsyncInit = function () {
        window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
      };
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  async function handleManualConnect(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/whatsapp/connect/manual', { phoneNumberId: phoneNumberId.trim() });
      await loadStatus();
      setShowManual(false);
      setPhoneNumberId('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al conectar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar este número de WhatsApp?')) return;
    setSaving(true); setError('');
    try {
      await api.delete('/whatsapp/disconnect');
      await loadStatus();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al desconectar');
    } finally {
      setSaving(false);
    }
  }

  function handleEmbeddedSignup() {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const configId = process.env.NEXT_PUBLIC_META_WA_CONFIG_ID;
    if (!appId || !configId) {
      setShowManual(true);
      return;
    }

    if (typeof window.FB === 'undefined') {
      setError('SDK de Meta no cargado. Intentá con conexión manual.');
      setShowManual(true);
      return;
    }

    const redirectUri = window.location.origin;

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          setSaving(true); setError('');
          api.post('/whatsapp/connect/embedded-signup', { code: response.authResponse.code, redirectUri })
            .then(() => loadStatus())
            .catch(err => setError(err.message || 'Error al conectar con Meta'))
            .finally(() => setSaving(false));
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        redirect_uri: redirectUri,
        extras: { sessionInfoVersion: 3 },
      }
    );
  }

  if (!status) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>WhatsApp</h2>
        <p className={styles.sectionDesc}>Conectá tu propio número para que los recordatorios salgan desde él</p>
      </div>

      <div className={styles.fields}>
        {status.connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'var(--success-bg, #dcfce7)', color: 'var(--success, #16a34a)',
                padding: '4px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                Conectado
              </span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {status.displayNumber || status.phoneNumberId}
              </span>
            </div>

            <div style={{
              background: 'var(--surface-2, #f8fafc)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '14px 16px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
            }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '6px' }}>
                Activar coexistencia (opcional)
              </strong>
              Para seguir usando WhatsApp Business en tu celular al mismo tiempo que la API:
              <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
                <li>Abrí WhatsApp Business en tu teléfono</li>
                <li>Tocá <strong>Configuración → Dispositivos vinculados → Vincular dispositivo</strong></li>
                <li>Escaneá el QR que aparece en el <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Meta Business Manager</a></li>
              </ol>
            </div>

            <button
              className={styles.btnDanger}
              onClick={handleDisconnect}
              disabled={saving}
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
            >
              {saving ? 'Desconectando...' : 'Desconectar número'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              className={styles.btnSave}
              onClick={handleEmbeddedSignup}
              disabled={saving}
              style={{ alignSelf: 'flex-start' }}
            >
              Conectar WhatsApp
            </button>

            <button
              type="button"
              onClick={() => setShowManual(v => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}
            >
              {showManual ? 'Ocultar conexión manual' : '¿Tenés problemas? Conectá manualmente'}
            </button>

            {showManual && (
              <form onSubmit={handleManualConnect} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Phone Number ID (de tu Meta Business Manager)
                  </label>
                  <input
                    className={styles.input}
                    value={phoneNumberId}
                    onChange={e => setPhoneNumberId(e.target.value)}
                    placeholder="Ej: 123456789012345"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className={styles.btnSave}
                  disabled={saving || !phoneNumberId.trim()}
                >
                  {saving ? 'Conectando...' : 'Conectar'}
                </button>
              </form>
            )}
          </div>
        )}

        {error && (
          <p style={{ color: 'var(--error, #dc2626)', fontSize: '13px', margin: 0 }}>{error}</p>
        )}
      </div>
    </section>
  );
}
