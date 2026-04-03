'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { api } from '../../../lib/api';
import { saveAuth } from '../../../lib/auth';
import styles from '../auth.module.css';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const features = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.02 12 19.79 19.79 0 011.07 3.4 2 2 0 013.05 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.92z"/>
      </svg>
    ),
    text: 'Confirmaciones de citas por WhatsApp',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    text: 'Sincronización con Google Calendar',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10"/>
        <path d="M12 20V4"/>
        <path d="M6 20v-6"/>
      </svg>
    ),
    text: 'Panel de métricas en tiempo real',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      saveAuth(res.data.token);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: 'email profile https://www.googleapis.com/auth/calendar.events',
    onSuccess: async ({ code }) => {
      setError('');
      setLoading(true);
      try {
        const res = await api.post('/auth/google', { code });
        saveAuth(res.data.token);
        router.push('/dashboard');
      } catch {
        setError('Error al iniciar sesión con Google');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Error al iniciar sesión con Google'),
  });

  return (
    <div className={styles.container}>
      {/* ── Decorative left panel ── */}
      <div className={styles.decorPanel}>
        <div className={styles.decorContent}>
          <div className={styles.decorBrand}>
            <img src="/logo_recordai.png" alt="RecordAI" className={styles.decorMark} />
            <span className={styles.decorBrandName}>RecordAI</span>
          </div>

          <h1 className={styles.decorHeading}>
            Tus citas,<br />
            <span className={styles.decorHeadingAccent}>automatizadas.</span>
          </h1>
          <p className={styles.decorSubtitle}>
            Confirmaciones por WhatsApp, recordatorios automáticos y seguimiento de citas en un solo lugar.
          </p>

          <div className={styles.decorFeatures}>
            {features.map((f, i) => (
              <div key={i} className={styles.decorFeature}>
                <div className={styles.decorFeatureIcon}>{f.icon}</div>
                <span className={styles.decorFeatureText}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          {/* Mobile brand (only shown < 900px) */}
          <div className={styles.mobileBrand}>
            <img src="/logo_recordai.png" alt="RecordAI" className={styles.mobileMark} />
            <span className={styles.mobileBrandName}>RecordAI</span>
          </div>

          <h2 className={styles.title}>Bienvenido de vuelta</h2>
          <p className={styles.subtitle}>Ingresá a tu cuenta para continuar</p>

          <div className={styles.form}>
            <button
              type="button"
              className={styles.googleBtn}
              onClick={() => googleLogin()}
              disabled={loading}
            >
              <GoogleIcon />
              Continuar con Google
            </button>

            <div className={styles.divider}>o continúa con email</div>

            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Email</label>
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Contraseña</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={styles.input}
                  required
                />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          </div>

          <p className={styles.link}>
            ¿No tenés cuenta? <a href="/register">Registrate gratis</a>
          </p>
        </div>
      </div>
    </div>
  );
}
