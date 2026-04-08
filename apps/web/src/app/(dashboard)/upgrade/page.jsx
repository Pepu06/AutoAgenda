'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import s from './upgrade.module.css';

export default function UpgradePage() {
  const [plans, setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/subscription/plans')
      .then(res => setPlans(res.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Orden: 100 | 200 | 300 citas (destacado: 200)
  const ORDER = ['inicial', 'profesional', 'custom'];
  const visiblePlans = ORDER
    .map(id => plans.find(p => p.id === id))
    .filter(Boolean);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Elegí tu plan</h1>
        <p className={s.subtitle}>Todos los planes incluyen confirmaciones automáticas, recordatorios y panel de control.</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className={s.grid}>
          {visiblePlans.map(plan => (
            <PlanCard key={plan.id} plan={plan} featured={plan.id === 'inicial'} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, featured }) {
  const [showPayment, setShowPayment] = useState(false);
  const [error, setError] = useState('');
  const reminders = plan.messageLimit == null ? 'Ilimitados' : plan.messageLimit.toLocaleString('es-AR');

  function handleSelectPlan() {
    if (plan.contactRequired) {
      window.location.href = 'mailto:hola@autoagenda.app?subject=Plan Custom';
      return;
    }
    setShowPayment(true);
  }

  return (
    <div className={`${s.card} ${featured ? s.cardFeatured : ''}`}>
      {featured && <div className={s.featuredBadge}>Más popular</div>}

      <div className={s.planName}>{plan.name}</div>
      {plan.subtitle && <div className={s.planSubtitle}>{plan.subtitle}</div>}

      {plan.customPricing ? (
        <div className={s.planPrice} style={{ fontSize: 20 }}>A medida</div>
      ) : (
        <div className={s.planPrice}>
          ${plan.price.toLocaleString('es-AR')}
        </div>
      )}
      <div className={s.planPriceSub}>
        {plan.customPricing ? 'Según volumen' : 'ARS / mes'}
      </div>

      <div className={s.divider} />

      <div className={s.reminderCard}>
        <span className={s.reminderLabel}>Recordatorios incluidos</span>
        <div className={s.reminderNumber}>{reminders}</div>
        <span className={s.reminderSub}>por mes</span>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {!showPayment ? (
        <button
          className={plan.contactRequired ? s.btnSecondary : s.btnPrimary}
          onClick={handleSelectPlan}
        >
          {plan.contactRequired ? 'Contactar →' : 'Seleccionar plan →'}
        </button>
      ) : (
        <>
          <div className={s.paymentInfo}>
            <div className={s.paymentTitle}>💳 Datos para transferencia:</div>
            <div className={s.paymentData}>
              <div className={s.paymentRow}>
                <span className={s.paymentLabel}>Alias:</span>
                <span className={s.paymentValue}>pedrogsoro</span>
              </div>
              <div className={s.paymentRow}>
                <span className={s.paymentLabel}>CBU:</span>
                <span className={s.paymentValue}>0000003100096112065785</span>
              </div>
              <div className={s.paymentRow}>
                <span className={s.paymentLabel}>Monto:</span>
                <span className={s.paymentValue}>${plan.price.toLocaleString('es-AR')} ARS</span>
              </div>
            </div>
            <div className={s.paymentNote}>
              Transferí el monto exacto y luego subí tu comprobante en la sección de Facturación.
            </div>
          </div>
          <Link
            href={`/billing/upload-proof?plan=${encodeURIComponent(plan.id)}`}
            className={s.btnPrimary}
            style={{ marginTop: 12, textDecoration: 'none' }}
          >
            Ir a subir comprobante →
          </Link>
        </>
      )}
    </div>
  );
}
