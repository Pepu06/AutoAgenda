'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated, clearAuth, getToken } from '../../lib/auth';
import { api } from '../../lib/api';
import styles from './dashboard.module.css';
import { TourProvider, useTour } from '../../components/tour/TourProvider';
import { TenantProvider } from '../../context/TenantContext';
import { TenantSwitcher } from '../../components/TenantSwitcher';

function TourBannerButton({ onDismiss }) {
  const { startTour } = useTour();
  return (
    <button
      onClick={() => { startTour(0); onDismiss(); }}
      className={styles.setupBannerLink}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', fontSize: 'inherit', color: 'inherit' }}
    >
      Hacer el tour guiado →
    </button>
  );
}

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendario',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/appointments',
    label: 'Citas',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    href: '/services',
    label: 'Servicios',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contactos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    href: '/tu-autoagenda',
    tourId: 'nav-tu-autoagenda',
    label: 'TuAutoAgenda',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
      </svg>
    ),
  },
  {
    href: '/billing',
    label: 'Facturación',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/settings',
    tourId: 'nav-settings',
    label: 'Configuración',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState({ initials: 'MN', businessName: 'Mi Negocio', profilePicture: null });
  const [setupBanner, setSetupBanner] = useState(false);
  const [gcalReconnectBanner, setGcalReconnectBanner] = useState(false);
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCollapsed(localStorage.getItem('sidebar_collapsed') === 'true');
    }

    try {
      const token = getToken();
      if (!token) return;

      const payload = JSON.parse(atob(token.split('.')[1]));
      const business = payload.tenantName || payload.email?.split('@')[0] || 'Mi Negocio';
      const picture = payload.picture || null;

      setProfile({
        initials: business.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
        businessName: business,
        profilePicture: picture,
      });

      // Show email verification banner if not verified (payload.emailVerified may be absent for old tokens)
      if (payload.emailVerified === false) {
        setEmailUnverified(true);
      }
    } catch {
      setProfile({ initials: 'MN', businessName: 'Mi Negocio', profilePicture: null });
    }
  }, []);

  // Mostrar banner si el onboarding no está completo
  useEffect(() => {
    if (!isAuthenticated()) return;
    const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('setup_banner_dismissed');
    if (dismissed) return;
    api.get('/settings/onboarding').then(res => {
      if (res.data?.completed === false) setSetupBanner(true);
    }).catch(() => {});
  }, []);

  // Mostrar banner si Google Calendar necesita reconexión
  useEffect(() => {
    if (!isAuthenticated()) return;
    api.get('/calendar/status').then(res => {
      if (res.data?.needsReconnect) setGcalReconnectBanner(true);
    }).catch(() => {});
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleResendVerification() {
    if (resendingEmail || resendDone) return;
    setResendingEmail(true);
    try {
      await api.post('/auth/resend-verification');
      setResendDone(true);
    } catch {
      // Silently ignore — user can try again later
    } finally {
      setResendingEmail(false);
    }
  }

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }

  function toggleMobileMenu() {
    setMobileMenuOpen(prev => !prev);
  }

  const { initials, businessName, profilePicture } = profile;

  return (
    <TenantProvider>
    <TourProvider>
    <div className={styles.layout}>
      {/* Mobile Header */}
      <div className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={toggleMobileMenu} aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className={styles.mobileLogo}>
          <img src="/logo_autoagenda.png" alt="AutoAgenda" className={styles.logoMark} />
          <span className={styles.logoText}>AutoAgenda</span>
        </div>
        <div className={styles.mobileAvatar}>
          {profilePicture ? (
            <img src={profilePicture} alt={businessName} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className={styles.overlay} onClick={toggleMobileMenu} />
      )}

      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileMenuOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <img src="/logo_autoagenda.png" alt="AutoAgenda" className={styles.logoMark} />
            <div className={styles.logoTexts}>
              <span className={styles.logoText}>AutoAgenda</span>
              <span className={styles.logoSub}>Pro</span>
            </div>
          </div>
          <button className={styles.collapseBtn} onClick={toggleCollapse} title={collapsed ? 'Expandir' : 'Colapsar'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>

        {/* Mobile-only menu header */}
        <div className={styles.mobileMenuHeader}>
          <div className={styles.mobileMenuAvatar}>
            {profilePicture ? (
              <img src={profilePicture} alt={businessName} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <div className={styles.mobileMenuName}>{businessName}</div>
            <div className={styles.mobileMenuRole}>Administrador</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-label={item.label}
              {...(item.tourId ? { 'data-tour': item.tourId } : {})}
              className={`${styles.navItem} ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <TenantSwitcher />
          <div className={styles.userRow}>
            {profilePicture ? (
              <img src={profilePicture} alt={businessName} className={styles.avatar} />
            ) : (
              <div className={styles.avatar}>{initials}</div>
            )}
            <div className={styles.userInfo}>
              <span className={styles.userName}>{businessName}</span>
              <span className={styles.userRole}>Administrador</span>
            </div>
          </div>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        {emailUnverified && (
          <div className={styles.setupBanner} style={{ background: 'var(--yellow-bg)', borderColor: 'var(--yellow-border)', color: 'var(--yellow)' }}>
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              Verificá tu email para asegurar el acceso a tu cuenta.{' '}
              {resendDone ? (
                <span style={{ fontWeight: 600 }}>¡Email enviado! Revisá tu bandeja.</span>
              ) : (
                <button
                  onClick={handleResendVerification}
                  disabled={resendingEmail}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontWeight: 600, textDecoration: 'underline', fontSize: 'inherit' }}
                >
                  {resendingEmail ? 'Enviando...' : 'Reenviar email'}
                </button>
              )}
            </span>
            <button
              className={styles.setupBannerClose}
              onClick={() => setEmailUnverified(false)}
              aria-label="Cerrar"
            >×</button>
          </div>
        )}
        {gcalReconnectBanner && (
          <div className={styles.setupBanner} style={{ background: 'var(--red-bg)', borderColor: 'var(--red-border)', color: 'var(--red)' }}>
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Tu conexión con Google Calendar expiró.{' '}
              <a href="/calendar" className={styles.setupBannerLink} style={{ color: 'var(--red)' }}>Reconectar →</a>
            </span>
            <button
              className={styles.setupBannerClose}
              onClick={() => setGcalReconnectBanner(false)}
              aria-label="Cerrar"
            >×</button>
          </div>
        )}
        {setupBanner && (
          <div className={styles.setupBanner}>
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Tu cuenta no está completamente configurada.{' '}
              <TourBannerButton onDismiss={() => { sessionStorage.setItem('setup_banner_dismissed', '1'); setSetupBanner(false); }} />
            </span>
            <button
              className={styles.setupBannerClose}
              onClick={() => { sessionStorage.setItem('setup_banner_dismissed', '1'); setSetupBanner(false); }}
              aria-label="Cerrar"
            >×</button>
          </div>
        )}
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
    </TourProvider>
    </TenantProvider>
  );
}
