'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './dashboard.page.module.css';

const STATUS_FALLBACK = { label: 'Sin enviar', color: 'var(--text-3)', bg: 'var(--surface-3)' };

const STATUS_CONFIG = {
  sin_enviar: STATUS_FALLBACK,
  null:       STATUS_FALLBACK,
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
  const [metrics, setMetrics]   = useState(null);
  const [usage, setUsage]       = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/metrics').then(res => setMetrics(res.data)).catch(() => {}),
      api.get('/subscription').then(res => setUsage(res)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const stats = {
    sentToday: metrics?.sentToday  ?? 0,
    confirmed: metrics?.confirmed  ?? 0,
    pending:   metrics?.pending    ?? 0,
    cancelled: metrics?.cancelled  ?? 0,
  };

  const upcomingToday = metrics?.upcomingToday ?? [];
  const upcomingNext  = metrics?.upcomingNext  ?? [];

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

      {/* Widget de uso */}
      {usage && <UsageWidget usage={usage.usage} trial={usage.trial} planDetails={usage.planDetails} />}

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
        const s = STATUS_CONFIG[e.status] ?? STATUS_FALLBACK;
        const dateObj = new Date(e.scheduledAt);
        const time = dateObj.toLocaleTimeString('es-AR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const dateLabel = showDate ? dateObj.toLocaleDateString('es-AR', {
          timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short',
        }) : null;
        const title = e.contactName || e.serviceName || 'Cita';
        const meta = e.serviceName && e.contactName ? e.serviceName : (e.contactPhone || '');
        return (
          <div key={e.id} className={styles.activityItem}>
            <div className={styles.activityDot} style={{ background: s.color }} />
            <div className={styles.activityBody}>
              <div className={styles.activityName}>{title}</div>
              <div className={styles.activityMeta}>{meta}</div>
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

function UsageWidget({ usage, trial, planDetails }) {
  if (!usage) return null;

  const isUnlimited = usage.unlimited;
  const sent = usage.messagesSent || 0;
  const limit = usage.messageLimit || 0;
  const ratio = isUnlimited || limit === 0 ? 0 : sent / limit;
  const isWarning = !isUnlimited && ratio >= 0.8;
  const isExpired = trial && !trial.active && !planDetails?.price;

  return (
    <a href="/billing" className={styles.usageWidget} style={{ borderColor: isExpired ? 'var(--red-border)' : isWarning ? 'var(--yellow-border)' : 'var(--border)' }}>
      <div className={styles.usageLeft}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isExpired ? 'var(--red)' : isWarning ? 'var(--yellow)' : 'var(--accent-2)' }}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        {isExpired ? (
          <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>Trial expirado · Elegir plan →</span>
        ) : trial?.active ? (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--accent-2)' }}>Trial</strong> · {trial.daysLeft} día{trial.daysLeft !== 1 ? 's' : ''} restante{trial.daysLeft !== 1 ? 's' : ''}
          </span>
        ) : isUnlimited ? (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong style={{ color: 'var(--accent-2)' }}>{planDetails?.name}</strong> · Mensajes ilimitados</span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Mensajes este mes: <strong style={{ color: isWarning ? 'var(--yellow)' : 'var(--text)' }}>{sent} / {limit}</strong>
            {isWarning && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>· Cerca del límite</span>}
          </span>
        )}
      </div>
      {!isUnlimited && !isExpired && !trial?.active && (
        <div className={styles.usageBar}>
          <div className={styles.usageBarFill} style={{ width: `${Math.min(ratio * 100, 100)}%`, background: isWarning ? 'var(--yellow)' : 'var(--accent-2)' }} />
        </div>
      )}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
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
