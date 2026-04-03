'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './dashboard.page.module.css';

const STATUS_CONFIG = {
  null:      { label: 'Sin enviar', color: 'var(--text-3)',  bg: 'var(--surface-3)' },
  pending:   { label: 'Pendiente',  color: 'var(--yellow)',  bg: 'var(--yellow-bg)' },
  notified:  { label: 'Notificado', color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  confirmed: { label: 'Confirmado', color: 'var(--green)',   bg: 'var(--green-bg)' },
  cancelled: { label: 'Cancelado',  color: 'var(--red)',     bg: 'var(--red-bg)' },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function DashboardPage() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/calendar/events')
      .then(res => setEvents(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const stats = {
    sentToday:  events.filter(e => e.start?.slice(0, 10) === today && e.status !== null).length,
    confirmed:  events.filter(e => e.status === 'confirmed').length,
    pending:    events.filter(e => e.status === 'pending').length,
    cancelled:  events.filter(e => e.status === 'cancelled').length,
  };

  const upcomingToday = events
    .filter(e => e.start?.slice(0, 10) === today)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 6);

  const greeting = getGreeting();

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          Resumen del día
        </div>
        <h1 className={styles.greeting}>
          {greeting},<br />
          <span className={styles.greetingAccent}>bienvenido.</span>
        </h1>
        <p className={styles.subtitle}>
          Tenés {stats.pending} cita{stats.pending !== 1 ? 's' : ''} pendiente{stats.pending !== 1 ? 's' : ''} de confirmación en los próximos 30 días.
        </p>
      </div>

      {loading ? (
        <div className="spinnerWrap"><div className="spinner" /></div>
      ) : (
        <>
          <p className={styles.sectionLabel}>Métricas</p>
          <div className={styles.grid}>
            <StatCard
              label="Enviados hoy"
              value={stats.sentToday}
              color="var(--blue)"
              iconBg="var(--blue-bg)"
              icon={<IconSend />}
            />
            <StatCard
              label="Confirmadas"
              value={stats.confirmed}
              color="var(--green)"
              iconBg="var(--green-bg)"
              icon={<IconCheck />}
            />
            <StatCard
              label="Pendientes"
              value={stats.pending}
              color="var(--yellow)"
              iconBg="var(--yellow-bg)"
              icon={<IconClock />}
            />
            <StatCard
              label="Canceladas"
              value={stats.cancelled}
              color="var(--red)"
              iconBg="var(--red-bg)"
              icon={<IconX />}
            />
          </div>

          <div className={styles.activitySection}>
            <div className={styles.activityHeader}>
              <span className={styles.activityTitle}>Citas de hoy</span>
              <a href="/appointments" className={styles.activityLink}>Ver todas →</a>
            </div>

            {upcomingToday.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <p className={styles.emptyText}>No hay citas agendadas para hoy.</p>
              </div>
            ) : (
              <div className={styles.activityList}>
                {upcomingToday.map(e => {
                  const s = STATUS_CONFIG[e.status] || STATUS_CONFIG['null'];
                  const time = new Date(e.start).toLocaleTimeString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div key={e.id} className={styles.activityItem}>
                      <div className={styles.activityDot} style={{ background: s.color }} />
                      <div className={styles.activityBody}>
                        <div className={styles.activityName}>{e.title}</div>
                        <div className={styles.activityMeta}>{e.phone || 'Sin teléfono'}</div>
                      </div>
                      <span
                        className={styles.activityBadge}
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                      <span className={styles.activityTime}>{time}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, iconBg, icon }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} style={{ background: iconBg, color }}>
        {icon}
      </div>
      <p className={styles.cardValue} style={{ color }}>{value}</p>
      <p className={styles.cardLabel}>{label}</p>
    </div>
  );
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}
