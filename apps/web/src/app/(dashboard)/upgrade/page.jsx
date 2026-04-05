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

  async function handleCheckout() {
    if (plan.contactRequired) {
      window.location.href = 'mailto:hola@autoagenda.app?subject=Plan Custom';
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await api.post('/subscription/checkout', {
        plan: plan.id,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err) {
      setError(err?.message || 'Error al iniciar el pago. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
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
        onClick={handleCheckout}
        disabled={loading}
      >
        {loading ? 'Redirigiendo...' : plan.contactRequired ? 'Contactar →' : 'Contratar ahora →'}
      </button>
    </div>
  );
}
