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
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

  const upcomingNext = events
    .filter(e => e.start?.slice(0, 10) > today && e.start?.slice(0, 10) <= in7Days && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 5);

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

      {/* Quick actions */}
      <div className={styles.quickActions}>
        <a href="/calendar" className={styles.quickAction}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Ver calendario
        </a>
        <a href="/appointments" className={styles.quickAction}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          Todas las citas
        </a>
        <a href="/contacts" className={styles.quickAction}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          Contactos
        </a>
        <a href="/settings" className={styles.quickAction}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Configuración
        </a>
      </div>

      {loading ? (
        <div className="spinnerWrap"><div className="spinner" /></div>
      ) : (
        <>
          <p className={styles.sectionLabel}>Métricas</p>
          <div className={styles.grid}>
            <StatCard label="Enviados hoy"  value={stats.sentToday} color="var(--blue)"   iconBg="var(--blue-bg)"   icon={<IconSend />} />
            <StatCard label="Confirmadas"   value={stats.confirmed} color="var(--green)"  iconBg="var(--green-bg)"  icon={<IconCheck />} />
            <StatCard label="Pendientes"    value={stats.pending}   color="var(--yellow)" iconBg="var(--yellow-bg)" icon={<IconClock />} />
            <StatCard label="Canceladas"    value={stats.cancelled} color="var(--red)"    iconBg="var(--red-bg)"    icon={<IconX />} />
          </div>

          {/* Citas de hoy */}
          <div className={styles.activitySection}>
            <div className={styles.activityHeader}>
              <span className={styles.activityTitle}>Citas de hoy</span>
              <a href="/appointments" className={styles.activityLink}>Ver todas →</a>
            </div>
            <EventList events={upcomingToday} emptyText="No hay citas agendadas para hoy." timezone="America/Argentina/Buenos_Aires" showDate={false} />
          </div>

          {/* Próximas citas (7 días) */}
          {upcomingNext.length > 0 && (
            <div className={styles.activitySection}>
              <div className={styles.activityHeader}>
                <span className={styles.activityTitle}>Próximos 7 días</span>
                <a href="/calendar" className={styles.activityLink}>Ver calendario →</a>
              </div>
              <EventList events={upcomingNext} emptyText="" timezone="America/Argentina/Buenos_Aires" showDate />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventList({ events, emptyText, timezone, showDate }) {
  if (events.length === 0 && emptyText) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <p className={styles.emptyText}>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={styles.activityList}>
      {events.map(e => {
        const s = STATUS_CONFIG[e.status] || STATUS_CONFIG['null'];
        const dateObj = new Date(e.start);
        const time = dateObj.toLocaleTimeString('es-AR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
        const dateLabel = showDate ? dateObj.toLocaleDateString('es-AR', {
          timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short',
        }) : null;
        return (
          <div key={e.id} className={styles.activityItem}>
            <div className={styles.activityDot} style={{ background: s.color }} />
            <div className={styles.activityBody}>
              <div className={styles.activityName}>{e.title}</div>
              <div className={styles.activityMeta}>{e.phone || 'Sin teléfono'}</div>
            </div>
            <span className={styles.activityBadge} style={{ background: s.bg, color: s.color }}>{s.label}</span>
            <span className={styles.activityTime}>
              {dateLabel && <span className={styles.activityDate}>{dateLabel} · </span>}
              {time}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, color, iconBg, icon }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} style={{ background: iconBg, color }}>{icon}</div>
      <p className={styles.cardValue} style={{ color }}>{value}</p>
      <p className={styles.cardLabel}>{label}</p>
    </div>
  );
}

function IconSend() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IconCheck() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
function IconClock() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconX() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
}
