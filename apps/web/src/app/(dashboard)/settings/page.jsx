'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './settings.module.css';

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Santiago',               label: 'Santiago (GMT-3/-4)' },
  { value: 'America/Bogota',                 label: 'Bogotá (GMT-5)' },
  { value: 'America/Mexico_City',            label: 'Ciudad de México (GMT-6)' },
  { value: 'Europe/Madrid',                  label: 'Madrid (GMT+1/+2)' },
  { value: 'UTC',                            label: 'UTC' },
];

const DEFAULTS = {
  businessName:        '',
  contactWhatsapp:     '',
  timezone:            'America/Argentina/Buenos_Aires',
  timeFormat:          '24h',
  messagingEnabled:    true,
  messageTemplate:     '',
  adminWhatsapp:       '',
  adminAlertsEnabled:  false,
  reportDays:          '1,2,3,4,5',
  reportMorningTime:   '08:00',
  reportEveningTime:   '20:00',
  reminderType:        'day_before',
  reminderTime:        '10:00',
  adminCancelTemplate: 'admin_cancelacion',
};

const WEEK_DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

function hoursOptions(min, max) {
  const opts = [];
  for (let h = min; h <= max; h++) {
    const val = `${String(h).padStart(2, '0')}:00`;
    opts.push(<option key={val} value={val}>{val}</option>);
  }
  return opts;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/settings').then(res => {
      const d = res.data;
      const mapped = {};
      if (d.businessName        != null) mapped.businessName        = d.businessName;
      if (d.contactWhatsapp     != null) mapped.contactWhatsapp     = d.contactWhatsapp;
      if (d.timezone            != null) mapped.timezone            = d.timezone;
      if (d.timeFormat          != null) mapped.timeFormat          = d.timeFormat;
      if (d.messagingEnabled    != null) mapped.messagingEnabled    = d.messagingEnabled;
      if (d.messageTemplate     != null) mapped.messageTemplate     = d.messageTemplate;
      if (d.adminWhatsapp       != null) mapped.adminWhatsapp       = d.adminWhatsapp;
      if (d.adminAlertsEnabled  != null) mapped.adminAlertsEnabled  = d.adminAlertsEnabled;
      if (d.reportDays          != null) mapped.reportDays          = d.reportDays;
      if (d.reportMorningTime   != null) mapped.reportMorningTime   = d.reportMorningTime;
      if (d.reportEveningTime   != null) mapped.reportEveningTime   = d.reportEveningTime;
      if (d.reminderType        != null) mapped.reminderType        = d.reminderType;
      if (d.reminderTime        != null) mapped.reminderTime        = d.reminderTime;
      if (d.adminCancelTemplate != null) mapped.adminCancelTemplate = d.adminCancelTemplate;
      setSettings(s => ({ ...s, ...mapped }));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function set(key, value) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put('/settings', {
        business_name:        settings.businessName,
        contact_whatsapp:     settings.contactWhatsapp,
        timezone:             settings.timezone,
        time_format:          settings.timeFormat,
        messaging_enabled:    settings.messagingEnabled,
        message_template:     settings.messageTemplate,
        admin_whatsapp:       settings.adminWhatsapp,
        admin_alerts_enabled: settings.adminAlertsEnabled,
        report_days:          settings.reportDays,
        report_morning_time:  settings.reportMorningTime,
        report_evening_time:  settings.reportEveningTime,
        reminder_type:        settings.reminderType,
        reminder_time:        settings.reminderTime,
        admin_cancel_template: settings.adminCancelTemplate,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="spinnerWrap"><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Configuración</h1>
        <p className={styles.subtitle}>Personalizá tu cuenta y el comportamiento del bot</p>
      </div>

      {/* GENERAL */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>General</h2>
          <p className={styles.sectionDesc}>Información básica de tu negocio</p>
        </div>
        <div className={styles.fields}>
          <Field label="Nombre del negocio">
            <input className={styles.input} value={settings.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Ej: Consultorio Dra. López" />
          </Field>
          <Field label="WhatsApp de contacto" hint="Número al que los clientes pueden escribir si tienen dudas">
            <input className={styles.input} value={settings.contactWhatsapp} onChange={e => set('contactWhatsapp', e.target.value)} placeholder="+5491112345678" />
          </Field>
          <div className={styles.row}>
            <Field label="Zona horaria">
              <select className={styles.select} value={settings.timezone} onChange={e => set('timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </Field>
            <Field label="Formato de hora">
              <div className={styles.toggle}>
                {['24h', '12h'].map(fmt => (
                  <button key={fmt} className={`${styles.toggleBtn} ${settings.timeFormat === fmt ? styles.toggleActive : ''}`} onClick={() => set('timeFormat', fmt)}>
                    {fmt}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Estado del motor de mensajes">
            <div className={styles.switchRow}>
              <Switch checked={settings.messagingEnabled} onChange={v => set('messagingEnabled', v)} />
              <span className={styles.switchLabel}>{settings.messagingEnabled ? 'Enviando mensajes' : 'Pausado'}</span>
            </div>
          </Field>
        </div>
      </section>

      {/* MENSAJE */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Mensaje</h2>
          <p className={styles.sectionDesc}>Personalizá el texto que aparece en el mensaje de recordatorio</p>
        </div>
        <div className={styles.fields}>
          <Field
            label="Mensaje personalizable"
            hint="Aparece en el cuerpo del recordatorio. Podés usarlo para instrucciones, links o info extra."
          >
            <textarea
              className={styles.textarea}
              value={settings.messageTemplate}
              onChange={e => set('messageTemplate', e.target.value)}
              rows={3}
              placeholder="Ej: Recordá traer tu número de obra social."
            />
          </Field>

          {/* Vista previa */}
          <Field label="Vista previa del mensaje">
            <div className={styles.phonePreview}>
              <div className={styles.phoneBar}>
                <div className={styles.phoneAvatar}>MG</div>
                <span className={styles.phoneContact}>María García</span>
              </div>
              <div className={styles.phoneMessages}>
                <div className={styles.phoneBubble}>
                  <div className={styles.phoneBubbleHeader}>
                    Recordatorio de turno con {settings.businessName || 'tu negocio'}
                  </div>
                  <p>Hola María García, como estas?</p>
                  {settings.messageTemplate && (
                    <p style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{settings.messageTemplate}</p>
                  )}
                  <p style={{ marginTop: 8 }}>El dia viernes 04-04, a las 10:30hs.</p>
                  <p style={{ marginTop: 8 }}>Muchas gracias.</p>
                  <p className={styles.phoneBubbleQuestion}>¿Deseas confirmar?</p>
                </div>
              </div>
            </div>
          </Field>
        </div>
      </section>

      {/* RECORDATORIOS */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recordatorios</h2>
          <p className={styles.sectionDesc}>Cuándo se envía el recordatorio automático al cliente</p>
        </div>
        <div className={styles.fields}>
          <Field label="Momento del recordatorio">
            <div className={styles.toggle}>
              {[
                { value: 'day_before', label: 'Día anterior' },
                { value: 'same_day',   label: 'Mismo día' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.toggleBtn} ${settings.reminderType === opt.value ? styles.toggleActive : ''}`}
                  onClick={() => set('reminderType', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Hora de envío" hint="A qué hora se envía el recordatorio (horario del negocio)">
            <select
              className={`${styles.select} ${styles.inputSm}`}
              value={settings.reminderTime}
              onChange={e => set('reminderTime', e.target.value)}
            >
              {hoursOptions(0, 23)}
            </select>
          </Field>
        </div>
      </section>

      {/* BOT */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Bot (Admin)</h2>
          <p className={styles.sectionDesc}>Alertas y reportes para el administrador</p>
        </div>
        <div className={styles.fields}>
          <Field label="WhatsApp del admin" hint="Separar con comas para múltiples números. Ej: +5491112345678, +5491187654321">
            <input className={styles.input} value={settings.adminWhatsapp} onChange={e => set('adminWhatsapp', e.target.value)} placeholder="+5491112345678" />
          </Field>
          <Field label="Alertas en tiempo real">
            <div className={styles.switchRow}>
              <Switch checked={settings.adminAlertsEnabled} onChange={v => set('adminAlertsEnabled', v)} />
              <span className={styles.switchLabel}>{settings.adminAlertsEnabled ? 'Activadas' : 'Desactivadas'}</span>
            </div>
          </Field>
          <Field label="Template de cancelación" hint="Nombre del template de WhatsApp que se envía al admin cuando un turno se cancela">
            <input className={styles.input} value={settings.adminCancelTemplate} onChange={e => set('adminCancelTemplate', e.target.value)} placeholder="admin_cancelacion" />
          </Field>
          <Field label="Días del reporte diario" hint="Qué días de la semana se envía el reporte">
            <div className={styles.dayPicker}>
              {WEEK_DAYS.map(d => {
                const active = (settings.reportDays || '').split(',').map(Number).includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    className={`${styles.dayBtn} ${active ? styles.dayBtnActive : ''}`}
                    onClick={() => {
                      const current = (settings.reportDays || '').split(',').map(Number).filter(n => !isNaN(n));
                      const next = active ? current.filter(v => v !== d.value) : [...current, d.value];
                      set('reportDays', next.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).join(','));
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className={styles.row}>
            <Field label="Hora reporte matutino" hint="6:00 a 10:00 — muestra turnos del día">
              <select
                className={`${styles.select} ${styles.inputSm}`}
                value={settings.reportMorningTime}
                onChange={e => set('reportMorningTime', e.target.value)}
              >
                {hoursOptions(6, 10)}
              </select>
            </Field>
            <Field label="Hora reporte vespertino" hint="20:00 a 00:00 — muestra turnos del día siguiente">
              <select
                className={`${styles.select} ${styles.inputSm}`}
                value={settings.reportEveningTime}
                onChange={e => set('reportEveningTime', e.target.value)}
              >
                {[...hoursOptions(20, 23), <option key="00:00" value="00:00">00:00</option>]}
              </select>
            </Field>
          </div>
        </div>
      </section>

      <div className={styles.saveBar}>
        <div className={styles.saveStatus}>
          {error && <span className={styles.errorText}>{error}</span>}
          {saved && <span className={styles.savedText}>✓ Cambios guardados</span>}
        </div>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      {children}
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchThumb} />
    </button>
  );
}
