'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import s from './billing.module.css';

export default function BillingPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api.get('/subscription')
      .then(res => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel() {
    if (!confirm('¿Seguro que querés cancelar tu suscripción? Mantendrás el acceso hasta el fin del período actual.')) return;
    setCancelling(true);
    try {
      await api.post('/subscription/cancel', {});
      const res = await api.get('/subscription');
      setData(res);
    } catch (err) {
      alert(err?.message || 'Error al cancelar la suscripción.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className={`${s.page} ${s.pageLoading}`}>
        <div className={s.loading}><div className="spinner" /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={s.page}>
        <div className={s.header}>
          <h1 className={s.title}>Facturación</h1>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
          No se encontró información de suscripción.{' '}
          <Link href="/upgrade" style={{ color: 'var(--accent)' }}>Ver planes →</Link>
        </div>
      </div>
    );
  }

  const { subscription, usage, trial, planDetails } = data;

  const isTrialActive  = trial?.active;
  const isTrialExpired = !trial?.active && subscription?.plan === 'trial';
  const isPaid         = !isTrialActive && !isTrialExpired && subscription?.plan !== 'trial';
  const isCancelled    = subscription?.status === 'cancelled';

  const usageRatio = usage?.unlimited || !usage?.messageLimit
    ? 0
    : (usage.messagesSent || 0) / usage.messageLimit;
  const isWarning = !usage?.unlimited && usageRatio >= 0.8;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Facturación</h1>
        <p className={s.subtitle}>Administrá tu plan y seguí el uso de mensajes.</p>
      </div>

      {/* Banner de estado */}
      {isTrialExpired && (
        <div className={`${s.banner} ${s.bannerExpired}`}>
          <div className={s.bannerIcon}>⚠️</div>
          <div className={s.bannerBody}>
            <div className={s.bannerTitle}>Tu período de prueba finalizó</div>
            <div className={s.bannerDesc}>Elegí un plan para continuar enviando mensajes automáticos.</div>
          </div>
          <Link href="/upgrade" className={`${s.bannerBtn} ${s.bannerBtnRed}`}>Elegir plan</Link>
        </div>
      )}

      {isTrialActive && (
        <div className={`${s.banner} ${s.bannerTrial}`}>
          <div className={s.bannerIcon}>🎉</div>
          <div className={s.bannerBody}>
            <div className={s.bannerTitle}>Trial activo · {trial.daysLeft} día{trial.daysLeft !== 1 ? 's' : ''} restante{trial.daysLeft !== 1 ? 's' : ''}</div>
            <div className={s.bannerDesc}>Estás probando AutoAgenda gratis con todas las funciones.</div>
          </div>
          <Link href="/upgrade" className={`${s.bannerBtn} ${s.bannerBtnAccent}`}>Ver planes</Link>
        </div>
      )}

      {isPaid && !isCancelled && (
        <div className={`${s.banner} ${s.bannerActive}`}>
          <div className={s.bannerIcon}>✅</div>
          <div className={s.bannerBody}>
            <div className={s.bannerTitle}>{planDetails?.name || subscription.plan} activo</div>
            <div className={s.bannerDesc}>
              {subscription.currentPeriodEnd
                ? `Próximo cobro: ${new Date(subscription.currentPeriodEnd).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}`
                : 'Suscripción activa'}
            </div>
          </div>
        </div>
      )}

      {isCancelled && (
        <div className={`${s.banner} ${s.bannerExpired}`}>
          <div className={s.bannerIcon}>🔴</div>
          <div className={s.bannerBody}>
            <div className={s.bannerTitle}>Suscripción cancelada</div>
            <div className={s.bannerDesc}>
              {subscription.currentPeriodEnd
                ? `Mantés el acceso hasta el ${new Date(subscription.currentPeriodEnd).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}.`
                : 'Tu suscripción fue cancelada.'}
            </div>
          </div>
          <Link href="/upgrade" className={`${s.bannerBtn} ${s.bannerBtnAccent}`}>Reactivar</Link>
        </div>
      )}

      <div className={s.cards}>
        {/* Card de uso de mensajes */}
        <div className={s.card}>
          <div className={s.cardTitle}>Uso de mensajes — mes actual</div>
          {usage?.unlimited ? (
            <div className={s.usageUnlimited}>✦ Mensajes ilimitados en tu plan</div>
          ) : (
            <>
              <div className={s.usageRow}>
                <span className={s.usageLabel}>Mensajes enviados</span>
                <span className={s.usageCount}>{usage?.messagesSent || 0} / {usage?.messageLimit || '—'}</span>
              </div>
              <div className={s.usageBar}>
                <div
                  className={s.usageBarFill}
                  style={{
                    width: `${Math.min(usageRatio * 100, 100)}%`,
                    background: isWarning ? 'var(--yellow)' : 'var(--accent-2)',
                  }}
                />
              </div>
              {isWarning && (
                <div className={s.usageWarning}>
                  ⚠ Usaste más del 80% de tus mensajes.{' '}
                  <Link href="/upgrade" style={{ color: 'var(--yellow)', textDecoration: 'underline' }}>Mejorar plan →</Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Card de info del plan */}
        <div className={s.card}>
          <div className={s.cardTitle}>Detalles del plan</div>
          <div className={s.planRow}>
            <span className={s.planRowLabel}>Plan</span>
            <span className={s.planRowValue}>{planDetails?.name || subscription?.plan || '—'}</span>
          </div>
          <div className={s.planRow}>
            <span className={s.planRowLabel}>Precio</span>
            <span className={s.planRowValue}>
              {planDetails?.price === 0 ? 'Gratis' : planDetails?.price ? `$${(planDetails.price / 1000).toFixed(1)}K ARS/mes` : '—'}
            </span>
          </div>
          <div className={s.planRow}>
            <span className={s.planRowLabel}>Mensajes / mes</span>
            <span className={s.planRowValue}>{usage?.unlimited ? 'Ilimitados' : (usage?.messageLimit ?? '—')}</span>
          </div>
          <div className={s.planRow}>
            <span className={s.planRowLabel}>Estado</span>
            <span className={s.planRowValue} style={{ textTransform: 'capitalize' }}>{subscription?.status || '—'}</span>
          </div>
          {!isTrialActive && !isTrialExpired && (
            <div style={{ marginTop: 16 }}>
              <Link href="/upgrade" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                Cambiar plan →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Zona de cancelación */}
      {isPaid && !isCancelled && (
        <div className={s.cancelZone}>
          <p className={s.cancelText}>
            Al cancelar, tu suscripción seguirá activa hasta el final del período de facturación actual.
          </p>
          <button className={s.cancelBtn} onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelando...' : 'Cancelar suscripción'}
          </button>
        </div>
      )}
    </div>
  );
}
