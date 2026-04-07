'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './setup.module.css';
import BusinessInfo from './steps/BusinessInfo';
import GoogleCalendar from './steps/GoogleCalendar';
import CalendarFormat from './steps/CalendarFormat';
import FirstService from './steps/FirstService';
import MessageTemplate from './steps/MessageTemplate';
import EnableMessaging from './steps/EnableMessaging';

const STEP_NAMES = [
  'Tu negocio',
  'Google Calendar',
  'Formato eventos',
  'Servicios',
  'Mensaje',
  'Activar',
];

const STEP_KEYS = ['business_info', 'google_calendar', 'calendar_format', 'first_service', 'message_template', 'enable_messaging'];

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [onboarding, setOnboarding] = useState(null);
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/settings/onboarding'),
      api.get('/settings'),
      api.get('/services'),
    ]).then(([ob, st, sv]) => {
      setOnboarding(ob.data);
      setSettings(st.data);
      setServices(sv.data || []);
      const firstIncomplete = STEP_KEYS.findIndex(k => !ob.data?.steps?.[k]?.done);
      setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : STEP_KEYS.length - 1);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function refreshOnboarding() {
    api.get('/settings/onboarding').then(res => setOnboarding(res.data)).catch(() => {});
  }

  const total = STEP_NAMES.length - 1;
  function goNext() { refreshOnboarding(); setCurrentStep(s => Math.min(s + 1, total)); }
  function goBack() { setCurrentStep(s => Math.max(s - 1, 0)); }
  function goSkip() { setCurrentStep(s => Math.min(s + 1, total)); }

  const steps = onboarding?.steps || {};

  function renderStep() {
    switch (currentStep) {
      case 0: return <BusinessInfo data={settings} onNext={goNext} onSkip={goSkip} />;
      case 1: return <GoogleCalendar done={steps.google_calendar?.done} onNext={goNext} onBack={goBack} onSkip={goSkip} />;
      case 2: return <CalendarFormat onNext={goNext} onBack={goBack} onSkip={goSkip} />;
      case 3: return <FirstService services={services} onNext={goNext} onBack={goBack} onSkip={goSkip} />;
      case 4: return <MessageTemplate data={settings} onNext={goNext} onBack={goBack} onSkip={goSkip} />;
      case 5: return <EnableMessaging steps={steps} onBack={goBack} />;
      default: return null;
    }
  }

  if (loading) return <div className="spinnerWrap"><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Configuración inicial</h1>
        <p className={styles.subtitle}>Seguí estos pasos para dejar AutoAgenda listo para usar.</p>
      </div>

      <div className={styles.stepper}>
        {STEP_NAMES.map((name, i) => {
          const isDone = steps[STEP_KEYS[i]]?.done;
          const isCurrent = i === currentStep;
          return (
            <div key={i} className={styles.stepItem}>
              <div
                className={`${styles.stepCircle} ${isDone ? styles.done : ''} ${isCurrent && !isDone ? styles.current : ''}`}
                title={name}
              >
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : i + 1}
              </div>
              {i < STEP_NAMES.length - 1 && (
                <div className={`${styles.stepLine} ${isDone ? styles.done : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.card}>
        {renderStep()}
      </div>
    </div>
  );
}
