'use client';

import { useEffect, useState } from 'react';
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

  // Orden: profesional | inicial (destacado) | custom
  const ORDER = ['profesional', 'inicial', 'custom'];
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
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  function handleSelectPlan() {
    // Redirigir a billing con el plan seleccionado
    window.location.href = `/billing?selected_plan=${plan.id}`;
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
          ${(plan.price / 1000).toFixed(0)}K
        </div>
      )}
      <div className={s.planPriceSub}>
        {plan.customPricing ? 'Según volumen' : 'ARS / mes'}
      </div>

      <div className={s.divider} />

      <ul className={s.features}>
        {(plan.features || []).map((f, i) => (
          <li key={i} className={s.feature}>{f}</li>
        ))}
      </ul>

      {plan.valueProposition && (
        <div className={s.valueProp}>{plan.valueProposition}</div>
      )}

      {error && <div className={s.error}>{error}</div>}

      <button
        className={plan.contactRequired ? s.btnSecondary : s.btnPrimary}
        onClick={plan.contactRequired ? () => window.location.href = 'mailto:hola@autoagenda.app?subject=Plan Custom' : handleSelectPlan}
        disabled={loading}
      >
        {loading ? 'Cargando...' : plan.contactRequired ? 'Contactar →' : 'Seleccionar plan →'}
      </button>
      
      {!plan.contactRequired && (
        <div className={s.paymentInfo}>
          <div className={s.paymentTitle}>Datos para transferencia:</div>
          <div className={s.paymentData}>
            <div className={s.paymentRow}>
              <span className={s.paymentLabel}>Alias:</span>
              <span className={s.paymentValue}>pedrogsoro</span>
            </div>
            <div className={s.paymentRow}>
              <span className={s.paymentLabel}>CBU:</span>
              <span className={s.paymentValue}>0000003100096112065785</span>
            </div>
          </div>
          <div className={s.paymentNote}>
            Después de transferir, subí tu comprobante en Facturación para activar el plan.
          </div>
        </div>
      )}
    </div>
  );
}
