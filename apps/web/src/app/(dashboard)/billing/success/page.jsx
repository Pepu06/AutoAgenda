'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './success.module.css';

export default function BillingSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const preapprovalId = searchParams.get('preapproval_id');
  const externalReference = searchParams.get('external_reference');

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.icon}>✓</div>
        <h1 className={s.title}>¡Suscripción activada!</h1>
        <p className={s.message}>
          Tu plan fue activado correctamente. Ya podés disfrutar de todos los beneficios de AutoAgenda.
        </p>
        
        {preapprovalId && (
          <div className={s.details}>
            <p className={s.detailLabel}>ID de suscripción:</p>
            <p className={s.detailValue}>{preapprovalId}</p>
          </div>
        )}

        <p className={s.redirect}>
          Redirigiendo al dashboard en {countdown} segundo{countdown !== 1 ? 's' : ''}...
        </p>

        <button 
          className={s.btn}
          onClick={() => router.push('/dashboard')}
        >
          Ir al dashboard ahora
        </button>
      </div>
    </div>
  );
}
