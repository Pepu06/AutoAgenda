'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import styles from '../setup.module.css';

const STEP_LABELS = {
  business_info:    'Nombre del negocio',
  google_calendar:  'Google Calendar conectado',
  calendar_format:  'Formato de eventos entendido',
  first_service:    'Al menos un servicio creado',
  message_template: 'Mensaje de recordatorio configurado',
};

export default function EnableMessaging({ steps, onBack }) {
  const router = useRouter();
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(steps?.enable_messaging?.done || false);
  const [error, setError] = useState('');

  const allReady = steps && Object.entries(STEP_LABELS).every(([key]) => steps[key]?.done);

  async function handleEnable() {
    setEnabling(true); setError('');
    try {
      await api.put('/settings', { messaging_enabled: true });
      await api.put('/settings/onboarding', { completed: true });
      setEnabled(true);
    } catch (err) {
      setError(err.message || 'Error al activar el motor');
    } finally {
      setEnabling(false);
    }
  }

  async function handleFinish() {
    try { await api.put('/settings/onboarding', { completed: true }); } catch { /* continuar */ }
    router.push('/dashboard');
  }

  const STEP_LINKS = {
    business_info:    '/setup',
    google_calendar:  '/setup',
    calendar_format:  '/setup',
    first_service:    '/services',
    message_template: '/setup',
  };

  return (
    <>
      <div className={styles.stepIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </div>
      <h2 className={styles.stepTitle}>Activar el motor de mensajes</h2>
      <p className={styles.stepDesc}>
        Revisá que todo esté completo. Una vez activado, AutoAgenda enviará recordatorios automáticos a tus clientes.
      </p>

      <div className={styles.checklist}>
        {Object.entries(STEP_LABELS).map(([key, label]) => {
          const done = steps?.[key]?.done;
          return (
            <div key={key} className={`${styles.checkItem} ${done ? styles.done : styles.pending}`}>
              <div className={`${styles.checkDot} ${done ? styles.done : styles.pending}`}>
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                )}
              </div>
              <span className={styles.checkLabel}>{label}</span>
              {!done && (
                <a href={STEP_LINKS[key]} className={styles.checkLink}>Completar</a>
              )}
            </div>
          );
        })}
      </div>

      {enabled ? (
        <div className={styles.success}>
          Motor de mensajes activado. Tus clientes empezarán a recibir recordatorios automáticos.
        </div>
      ) : (
        <>
          {allReady && (
            <div className={styles.switchRow}>
              <div>
                <div className={styles.switchLabel}>Motor de mensajes</div>
                <div className={styles.switchDesc}>Activar envío automático de recordatorios por WhatsApp</div>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={false} onChange={handleEnable} disabled={enabling} />
                <span className={styles.switchTrack} />
              </label>
            </div>
          )}
          {error && <div className={styles.error}>{error}</div>}
        </>
      )}

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onBack}>Anterior</button>
        <button className={styles.btnSuccess} onClick={handleFinish}>
          {enabled ? 'Ir al dashboard' : 'Terminar configuración'}
        </button>
      </div>
    </>
  );
}
