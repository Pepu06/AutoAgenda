import Link from 'next/link';
import s from './landing.module.css';

export const metadata = {
  title: 'AutoAgenda — Confirmaciones de turnos por WhatsApp',
  description:
    'Automatizá los recordatorios de tus turnos vía WhatsApp. Sincronizá con Google Calendar y reducí las inasistencias sin esfuerzo.',
};

const steps = [
  {
    num: 1,
    title: 'Conectá tu cuenta',
    desc: 'Ingresá al dashboard, autorizá el acceso a tu Google Calendar y configurá tu número de WhatsApp. Listo en menos de 2 minutos.',
    syntax: null,
  },
  {
    num: 2,
    title: 'Creá el evento en Google Calendar',
    desc: 'Usá la sintaxis correcta en el título y la descripción del evento para que el sistema identifique al cliente y su número automáticamente.',
    syntax: [
      {
        tag: 'Título',
        tagClass: 'syntaxTagBlue',
        label: 'El nombre del cliente entre corchetes rectos',
        example: (
          <>
            Cita Médica - <span className={s.syntaxHighlight}>[Juan Pérez]</span>
          </>
        ),
        tip: 'El texto fuera de los corchetes puede ser cualquier nombre de servicio o descripción.',
      },
      {
        tag: 'Descripción',
        tagClass: 'syntaxTagGreen',
        label: 'El teléfono WhatsApp entre paréntesis (sin + ni espacios)',
        example: (
          <>
            Confirmar asistencia{' '}
            <span className={s.syntaxHighlight}>(5491140962011)</span>
          </>
        ),
        tip: 'Incluí el código de país. Ej: 549 para Argentina → 5491140962011.',
      },
    ],
  },
  {
    num: 3,
    title: 'El sistema trabaja por vos',
    desc: 'AutoAgenda lee el evento, extrae los datos del cliente y envía el mensaje de recordatorio automáticamente por WhatsApp en el horario configurado. El cliente confirma o cancela con un solo toque.',
    syntax: null,
  },
];

const benefits = [
  {
    icon: '⏱️',
    iconClass: 'benefitIconBlue',
    title: 'Ahorrá tiempo valioso',
    desc: 'Eliminá las llamadas manuales de confirmación. El sistema notifica a cada cliente de forma automática sin que tengas que intervenir.',
  },
  {
    icon: '📉',
    iconClass: 'benefitIconGreen',
    title: 'Reducí las inasistencias',
    desc: 'Los recordatorios por WhatsApp tienen tasas de apertura superiores al 90 %. Menos no-shows, más ingresos para tu negocio.',
  },
  {
    icon: '💬',
    iconClass: 'benefitIconTeal',
    title: 'Mejorá la comunicación',
    desc: 'Tus clientes reciben confirmaciones personalizadas y pueden responder directamente. Una experiencia profesional y cercana.',
  },
];

export default function LandingPage() {
  return (
    <div className={s.page}>
      {/* ── Navbar ── */}
      <nav className={s.navbar}>
        <div className={s.navInner}>
          <span className={s.logo}>AutoAgenda</span>
          <Link href="/dashboard" className={s.navCta}>
            Entrar al Dashboard <span>→</span>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroBg} />
        <div className={s.heroBadge}>
          <span>✦</span> Confirmaciones automáticas por WhatsApp
        </div>
        <h1 className={s.heroTitle}>
          Tus turnos confirmados,{' '}
          <span>sin llamadas ni olvidos</span>
        </h1>
        <p className={s.heroSubtitle}>
          AutoAgenda se conecta con Google Calendar y envía recordatorios automáticos por WhatsApp. Tus clientes confirman o cancelan con un solo toque.
        </p>
        <Link href="/dashboard" className={s.heroCta}>
          Entrar al Dashboard <span className={s.heroArrow}>→</span>
        </Link>
        <div className={s.heroStats}>
          <div className={s.heroStat}>
            <span className={s.heroStatNum}>+90%</span>
            <span className={s.heroStatLabel}>tasa de apertura</span>
          </div>
          <div className={s.heroStat}>
            <span className={s.heroStatNum}>2 min</span>
            <span className={s.heroStatLabel}>para configurar</span>
          </div>
          <div className={s.heroStat}>
            <span className={s.heroStatNum}>0</span>
            <span className={s.heroStatLabel}>llamadas manuales</span>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={`${s.section} ${s.howSection}`}>
        <div className={s.sectionInner}>
          <div className={s.sectionLabel}>
            <span>📋</span> Guía de uso
          </div>
          <h2 className={s.sectionTitle}>¿Cómo funciona?</h2>
          <p className={s.sectionSubtitle}>
            Tres pasos simples para automatizar tus confirmaciones de turno.
          </p>
          <div className={s.steps}>
            {steps.map((step) => (
              <div key={step.num} className={s.step}>
                <div className={s.stepLeft}>
                  <div className={s.stepNum}>{step.num}</div>
                </div>
                <div className={s.stepBody}>
                  <h3 className={s.stepTitle}>{step.title}</h3>
                  <p className={s.stepDesc}>{step.desc}</p>
                  {step.syntax && (
                    <div className={s.syntaxCards}>
                      {step.syntax.map((item) => (
                        <div key={item.tag} className={s.syntaxCard}>
                          <div className={s.syntaxCardHeader}>
                            <span className={`${s.syntaxTag} ${s[item.tagClass]}`}>
                              {item.tag}
                            </span>
                          </div>
                          <div className={s.syntaxRule}>
                            <span className={s.syntaxLabel}>{item.label}</span>
                            <div className={s.syntaxExample}>{item.example}</div>
                            <span className={s.syntaxTip}>💡 {item.tip}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <div className={s.sectionLabel}>
            <span>🚀</span> Beneficios
          </div>
          <h2 className={s.sectionTitle}>Por qué elegir AutoAgenda</h2>
          <p className={s.sectionSubtitle}>
            Diseñado para profesionales independientes y negocios que quieren optimizar su agenda sin complicaciones.
          </p>
          <div className={s.benefitsGrid}>
            {benefits.map((b) => (
              <div key={b.title} className={s.benefitCard}>
                <div className={`${s.benefitIcon} ${s[b.iconClass]}`}>
                  {b.icon}
                </div>
                <h3 className={s.benefitTitle}>{b.title}</h3>
                <p className={s.benefitDesc}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className={s.ctaBanner}>
        <h2 className={s.ctaBannerTitle}>
          Empezá a automatizar tu agenda hoy
        </h2>
        <p className={s.ctaBannerSub}>
          Conectá tu Google Calendar y enviá tu primer recordatorio en minutos.
        </p>
        <Link href="/dashboard" className={s.ctaBannerBtn}>
          Ir al Dashboard →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.footerLogo}>AutoAgenda</span>
          <div className={s.footerLinks}>
            <Link href="/privacy" className={s.footerLink}>
              Política de Privacidad
            </Link>
            <Link href="/terms" className={s.footerLink}>
              Términos del Servicio
            </Link>
            <Link href="/dashboard" className={s.footerLink}>
              Dashboard
            </Link>
          </div>
          <span className={s.footerCopy}>© 2026 AutoAgenda</span>
        </div>
      </footer>
    </div>
  );
}
