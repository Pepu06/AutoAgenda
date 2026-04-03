'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './settings.module.css';

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-3/-4)' },
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1/+2)' },
  { value: 'UTC', label: 'UTC' },
];

const DEFAULTS = {
  businessName: '',
  contactWhatsapp: '',
  timezone: 'America/Argentina/Buenos_Aires',
  timeFormat: '24h',
  messagingEnabled: true,
  messageTemplate: '',
  whatsappProvider: 'meta',
  whatsappPhoneNumberId: '',
  whatsappAccessToken: '',
  wasenderApiKey: '',
  adminWhatsapp: '',
  adminAlertsEnabled: false,
  reportDays: '1,2,3,4,5',
  reportType: 'morning',
  adminDailyReportTime: '08:00',
  reminderType: 'day_before',
  reminderTime: '10:00',
  locationMode: 'fixed',
  location: '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/settings').then(res => {
      const d = res.data;
      const mapped = {};
      if (d.businessName != null) mapped.businessName = d.businessName;
      if (d.contactWhatsapp != null) mapped.contactWhatsapp = d.contactWhatsapp;
      if (d.timezone != null) mapped.timezone = d.timezone;
      if (d.timeFormat != null) mapped.timeFormat = d.timeFormat;
      if (d.messagingEnabled != null) mapped.messagingEnabled = d.messagingEnabled;
      if (d.messageTemplate != null) mapped.messageTemplate = d.messageTemplate;
      if (d.whatsappProvider != null) mapped.whatsappProvider = d.whatsappProvider;
      if (d.whatsappPhoneNumberId != null) mapped.whatsappPhoneNumberId = d.whatsappPhoneNumberId;
      if (d.whatsappAccessToken != null) mapped.whatsappAccessToken = d.whatsappAccessToken;
      if (d.wasenderApiKey != null) mapped.wasenderApiKey = d.wasenderApiKey;
      if (d.adminWhatsapp != null) mapped.adminWhatsapp = d.adminWhatsapp;
      if (d.adminAlertsEnabled != null) mapped.adminAlertsEnabled = d.adminAlertsEnabled;
      if (d.reportDays != null) mapped.reportDays = d.reportDays;
      if (d.reportType != null) mapped.reportType = d.reportType;
      if (d.adminDailyReportTime != null) mapped.adminDailyReportTime = d.adminDailyReportTime;
      if (d.reminderType != null) mapped.reminderType = d.reminderType;
      if (d.reminderTime != null) mapped.reminderTime = d.reminderTime;
      if (d.locationMode != null) mapped.locationMode = d.locationMode;
      if (d.location     != null) mapped.location     = d.location;
      setSettings(s => ({ ...s, ...mapped }));
    }).catch(() => { }).finally(() => setLoading(false));
  }, []);

  function set(key, value) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put('/settings', {
        business_name: settings.businessName,
        timezone: settings.timezone,
        time_format: settings.timeFormat,
        messaging_enabled: settings.messagingEnabled,
        message_template: settings.messageTemplate,
        whatsapp_provider: settings.whatsappProvider,
        whatsapp_phone_number_id: settings.whatsappPhoneNumberId,
        whatsapp_access_token: settings.whatsappAccessToken,
        wasender_api_key: settings.wasenderApiKey,
        admin_whatsapp: settings.adminWhatsapp,
        admin_alerts_enabled: settings.adminAlertsEnabled,
        report_days: settings.reportDays,
        report_type: settings.reportType,
        admin_daily_report_time: settings.adminDailyReportTime,
        reminder_type: settings.reminderType,
        reminder_time: settings.reminderTime,
        location_mode: settings.locationMode,
        location:      settings.location,
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
          <Field label="Nombre del negocio" hint="Hasta 40 caracteres, se muestra en el encabezado del mensaje de recordatorio.">
            <input className={styles.input} value={settings.businessName} onChange={e => set('businessName', e.target.value)} placeholder="Ej: Consultorio Dra. López" />
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

      {/* PROVEEDOR DE WHATSAPP */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Proveedor de WhatsApp</h2>
          <p className={styles.sectionDesc}>Elegí qué servicio usar para enviar mensajes</p>
        </div>
        <div className={styles.fields}>
          <Field label="Proveedor">
            <div className={styles.toggle}>
              {[
                { value: 'meta', label: 'Meta (WhatsApp Business API)' },
                { value: 'wasender', label: 'WasenderAPI' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.toggleBtn} ${settings.whatsappProvider === opt.value ? styles.toggleActive : ''}`}
                  onClick={() => set('whatsappProvider', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          {settings.whatsappProvider === 'wasender' && (
            <Field label="Wasender Token" hint="Token de API de WasenderAPI">
              <input className={styles.input} type="password" value={settings.wasenderApiKey} onChange={e => set('wasenderApiKey', e.target.value)} placeholder="tu_token_wasender" />
            </Field>
          )}
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
                <div className={styles.phoneAvatar}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M9.175 10.825Q8 9.65 8 8t1.175-2.825T12 4t2.825 1.175T16 8t-1.175 2.825T12 12t-2.825-1.175M4 20v-2.8q0-.85.438-1.562T5.6 14.55q1.55-.775 3.15-1.162T12 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T20 17.2V20z" /></svg>
                </div>
                <span className={styles.phoneContact}>María García</span>
              </div>
              <div className={styles.phoneMessages}>
                <div className={styles.phoneBubble}>
                  <div className={styles.phoneBubbleHeader}>
                    Recordatorio: {settings.businessName || 'tu negocio'}
                  </div>
                  <p>Hola María García, como estas? 👋</p>
                  {settings.messageTemplate && (
                    <p style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{settings.messageTemplate}</p>
                  )}
                  <p style={{ marginTop: 8 }}>🗓️ El dia viernes 04-04, a las 10:30.</p>
                  <p>📍 {settings.location || 'La dirección puesta en el evento'}</p>
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
                { value: 'same_day', label: 'Mismo día' },
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
          <Field label="Tipo de reporte">
            <div className={styles.toggle}>
              {[
                { value: 'morning', label: 'Matutino (turnos del día)' },
                { value: 'evening', label: 'Vespertino (turnos del día siguiente)' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.toggleBtn} ${settings.reportType === opt.value ? styles.toggleActive : ''}`}
                  onClick={() => {
                    set('reportType', opt.value);
                    set('adminDailyReportTime', opt.value === 'morning' ? '08:00' : '20:00');
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Hora de envío" hint={settings.reportType === 'morning' ? '6:00 a 10:00' : '20:00 a 00:00'}>
            <select
              className={`${styles.select} ${styles.inputSm}`}
              value={settings.adminDailyReportTime}
              onChange={e => set('adminDailyReportTime', e.target.value)}
            >
              {settings.reportType === 'morning'
                ? hoursOptions(6, 10)
                : [...hoursOptions(20, 23), <option key="00:00" value="00:00">00:00</option>]
              }
            </select>
          </Field>
        </div>
      </section>

      {/* UBICACIÓN */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Ubicación</h2>
          <p className={styles.sectionDesc}>Dirección que se incluye en el recordatorio al cliente</p>
        </div>
        <div className={styles.fields}>
          <Field label="Fuente de la ubicación">
            <div className={styles.toggle}>
              {[
                { value: 'fixed',    label: 'Dirección fija' },
                { value: 'calendar', label: 'Desde el evento de Google Calendar' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.toggleBtn} ${settings.locationMode === opt.value ? styles.toggleActive : ''}`}
                  onClick={() => set('locationMode', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          {settings.locationMode === 'fixed' && (
            <Field label="Dirección" hint="Se enviará en todos los recordatorios como variable {{ubicacion}}">
              <input
                className={styles.input}
                value={settings.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Ej: Av. Corrientes 1234, CABA"
              />
            </Field>
          )}
          {settings.locationMode === 'calendar' && (
            <Field label="Fuente" hint="Se usará la dirección definida en cada evento de Google Calendar. Si el evento no tiene dirección, el campo quedará vacío.">
              <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '10px 0' }}>
                La variable <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{ubicacion}}'}</code> tomará el valor del campo "Lugar" de cada evento en Google Calendar.
              </div>
            </Field>
          )}
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
