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

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ tenantName: '', slug: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', form);
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
        setError('Error al registrarse con Google');
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError('Error al registrarse con Google'),
  });

  return (
    <div className={styles.container}>
      {/* ── Decorative panel ── */}
      <div className={styles.decorPanel}>
        <div className={styles.decorContent}>
          <div className={styles.decorBrand}>
            <img src="/logo_recordai.png" alt="RecordAI" className={styles.decorMark} />
            <span className={styles.decorBrandName}>RecordAI</span>
          </div>
          <h1 className={styles.decorHeading}>
            Empezá gratis<br />
            <span className={styles.decorHeadingAccent}>en minutos.</span>
          </h1>
          <p className={styles.decorSubtitle}>
            Conectá tu negocio con WhatsApp y Google Calendar. Automatizá confirmaciones y nunca más pierdas una cita.
          </p>
          <div className={styles.decorFeatures}>
            {[
              'Sin tarjeta de crédito requerida',
              'Configuración en menos de 5 minutos',
              'Soporte para múltiples usuarios',
            ].map((text, i) => (
              <div key={i} className={styles.decorFeature}>
                <div className={styles.decorFeatureIcon}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className={styles.decorFeatureText}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.mobileBrand}>
            <img src="/logo_recordai.png" alt="RecordAI" className={styles.mobileMark} />
            <span className={styles.mobileBrandName}>RecordAI</span>
          </div>

          <h2 className={styles.title}>Crear cuenta</h2>
          <p className={styles.subtitle}>Empezá a usar RecordAI hoy, es gratis</p>

          <div className={styles.form}>
            <button
              type="button"
              className={styles.googleBtn}
              onClick={() => googleLogin()}
              disabled={loading}
            >
              <GoogleIcon />
              Registrarse con Google
            </button>

            <div className={styles.divider}>o registrate con email</div>

            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Nombre del negocio</label>
                <input
                  type="text"
                  placeholder="Mi Clínica"
                  value={form.tenantName}
                  onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Slug (identificador único)</label>
                <input
                  type="text"
                  placeholder="mi-clinica"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s/g, '-') })}
                  className={styles.input}
                  required
                />
              </div>
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
                {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
              </button>
            </form>
          </div>

          <p className={styles.link}>
            ¿Ya tenés cuenta? <a href="/login">Ingresá</a>
          </p>
        </div>
      </div>
    </div>
  );
}
