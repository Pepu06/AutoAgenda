'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { clearAuth } from '../../../lib/auth';
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
  whatsappProvider: 'baileys',
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
  confirmReplyMessage: '',
  cancelReplyMessage: '',
  baileysConnected: false,
  reminderTemplate: '',
  confirmationTemplate: '',
  gonzalezSoroWebhookEnabled: false,
  gonzalezSoroWhatsappEnabled: false,
  hasInmobiliariaIntegration: false,
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
  const router = useRouter();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [qrImage, setQrImage] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const eventSourceRef = useRef(null);
  const isLoadedRef = useRef(false);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    api.get('/settings/onboarding').then(res => {
      if (res.data?.completed === false) setOnboardingCompleted(false);
    }).catch(() => {});
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
      if (d.confirmReplyMessage != null) mapped.confirmReplyMessage = d.confirmReplyMessage;
      if (d.cancelReplyMessage  != null) mapped.cancelReplyMessage  = d.cancelReplyMessage;
      if (d.baileysConnected != null) mapped.baileysConnected = d.baileysConnected;
      if (d.reminderTemplate != null) mapped.reminderTemplate = d.reminderTemplate;
      if (d.confirmationTemplate != null) mapped.confirmationTemplate = d.confirmationTemplate;
      if (d.gonzalezSoroWebhookEnabled != null) mapped.gonzalezSoroWebhookEnabled = d.gonzalezSoroWebhookEnabled;
      if (d.gonzalezSoroWhatsappEnabled != null) mapped.gonzalezSoroWhatsappEnabled = d.gonzalezSoroWhatsappEnabled;
      if (d.hasInmobiliariaIntegration != null) mapped.hasInmobiliariaIntegration = d.hasInmobiliariaIntegration;
      setSettings(s => ({ ...s, ...mapped }));
      isLoadedRef.current = true;
    }).catch(() => { }).finally(() => setLoading(false));
  }, []);

  // Auto-save: debounce 1.5s after any change
  useEffect(() => {
    if (!isLoadedRef.current) return;
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => handleSave(), 1500);
    return () => clearTimeout(autoSaveTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

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
        confirm_reply_message: settings.confirmReplyMessage,
        cancel_reply_message:  settings.cancelReplyMessage,
        reminder_template:     settings.reminderTemplate || null,
        confirmation_template: settings.confirmationTemplate || null,
        gonzalez_soro_webhook_enabled: settings.gonzalezSoroWebhookEnabled,
        gonzalez_soro_whatsapp_enabled: settings.gonzalezSoroWhatsappEnabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api.delete('/settings/account');
      clearAuth();
      router.replace('/login');
    } catch (err) {
      setError(err.message || 'Error al eliminar la cuenta');
      setDeleting(false);
    }
  }

  function startQRScan() {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setQrLoading(true);
    setQrImage(null);
    setQrError('');

    api.post('/baileys/connect').catch(() => {});

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${apiUrl}/baileys/qr?token=${token}`);
    eventSourceRef.current = es;

    es.addEventListener('qr', (e) => {
      const { qr } = JSON.parse(e.data);
      setQrImage(qr);
      setQrLoading(false);
    });

    es.addEventListener('connected', () => {
      es.close();
      setQrImage(null);
      setQrLoading(false);
      set('baileysConnected', true);
    });

    es.addEventListener('disconnected', () => {
      es.close();
      setQrImage(null);
      setQrLoading(false);
      setQrError('Conexión fallida. Intentá de nuevo.');
    });

    es.onerror = () => {
      setQrLoading(false);
      setQrError('Error de conexión. Verificá que la API esté corriendo.');
      es.close();
    };
  }

  async function handleBaileysDisconnect() {
    try {
      await api.delete('/baileys/session');
      set('baileysConnected', false);
      setQrImage(null);
      setQrError('');
    } catch (err) {
      setError(err.message || 'Error al desconectar');
    }
  }

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  if (loading) return <div className="spinnerWrap"><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Configuración</h1>
        <p className={styles.subtitle}>Personalizá tu cuenta y el comportamiento del bot</p>
        {!onboardingCompleted && (
          <a href="/setup" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Volver al asistente de configuración inicial
          </a>
        )}
      </div>

      {/* GENERAL */}
      <section className={styles.section} data-tour="settings-general">
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

      {/* MENSAJE */}
      <section className={styles.section} data-tour="settings-mensaje">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Mensajes</h2>
          <p className={styles.sectionDesc}>Personalizá el texto completo de cada mensaje. Usá variables entre llaves dobles para insertar datos del turno.</p>
        </div>
        <div className={styles.fields}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
            {['{{nombre}}','{{servicio}}','{{fecha}}','{{hora}}','{{ubicacion}}','{{negocio}}','{{recordatorio}}'].map(v => (
              <code key={v} style={{ background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, fontSize: 12, cursor: 'default' }}>{v}</code>
            ))}
          </div>
          <Field
            label="Mensaje de confirmación"
            hint="Se envía al crear un turno. El link de confirmación se agrega automáticamente al final."
          >
            <textarea
              className={styles.textarea}
              value={settings.confirmationTemplate}
              onChange={e => set('confirmationTemplate', e.target.value)}
              rows={7}
              placeholder={`✅ Confirmación de turno\n\nHola {{nombre}}, tu turno de {{servicio}} fue agendado para el {{fecha}} a las {{hora}}.\n📌 Ubicación: {{ubicacion}}\n\nTe enviaremos un recordatorio {{recordatorio}}.\n\n{{negocio}}`}
            />
          </Field>
          <Field
            label="Mensaje de recordatorio"
            hint="Se envía el día anterior (o el mismo día) al turno. El link de confirmación se agrega automáticamente al final."
          >
            <textarea
              className={styles.textarea}
              value={settings.reminderTemplate}
              onChange={e => set('reminderTemplate', e.target.value)}
              rows={7}
              placeholder={`📅 Recordatorio de turno con {{negocio}}\n\nHola {{nombre}}, ¿cómo estás? 👋\n\n📆 Fecha: {{fecha}}\n🕐 Hora: {{hora}}\n📌 Ubicación: {{ubicacion}}`}
            />
          </Field>
          <Field label="">
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
              💡 Si dejás el campo vacío se usa el mensaje predeterminado. El link <em>"Confirmá o cancelá tu turno aquí"</em> siempre se agrega al final.
            </p>
          </Field>
        </div>
      </section>

      {/* RESPUESTAS AUTOMÁTICAS */}
      <section className={styles.section} data-tour="settings-respuestas">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Respuestas automáticas</h2>
          <p className={styles.sectionDesc}>Mensajes que el bot envía al cliente cuando confirma o cancela su turno</p>
        </div>
        <div className={styles.fields}>
          <Field
            label="Mensaje al confirmar"
            hint="Se envía cuando el cliente toca 'Confirmar'. Dejá vacío para no enviar nada."
          >
            <textarea
              className={styles.textarea}
              value={settings.confirmReplyMessage}
              onChange={e => set('confirmReplyMessage', e.target.value)}
              rows={3}
              placeholder="Ej: ¡Perfecto! Tu turno está confirmado. ¡Te esperamos!"
            />
          </Field>
          <Field
            label="Mensaje al cancelar"
            hint="Se envía cuando el cliente toca 'Cancelar'. Dejá vacío para no enviar nada."
          >
            <textarea
              className={styles.textarea}
              value={settings.cancelReplyMessage}
              onChange={e => set('cancelReplyMessage', e.target.value)}
              rows={3}
              placeholder="Ej: Entendido, tu turno fue cancelado. ¡Cuando quieras podés sacar un nuevo turno!"
            />
          </Field>
        </div>
      </section>

      {/* RECORDATORIOS */}
      <section className={styles.section} data-tour="settings-recordatorios">
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
      <section className={styles.section} data-tour="settings-bot-admin">
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
      <section className={styles.section} data-tour="settings-ubicacion">
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

      {/* PROVEEDOR WHATSAPP */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Proveedor de WhatsApp</h2>
          <p className={styles.sectionDesc}>Elegí qué servicio usar para enviar mensajes</p>
        </div>
        <div className={styles.fields}>
          <Field label="Proveedor">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { value: 'baileys', label: 'WhatsApp (QR)' },
                { value: 'wasender', label: 'WasenderAPI' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
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
              <input
                className={styles.input}
                type="password"
                value={settings.wasenderApiKey}
                onChange={e => set('wasenderApiKey', e.target.value)}
                placeholder="tu_token_wasender"
              />
            </Field>
          )}
        </div>
      </section>

      {/* WHATSAPP (Baileys QR) */}
      <section className={styles.section} data-tour="settings-whatsapp" style={settings.whatsappProvider !== 'baileys' ? { display: 'none' } : undefined}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>WhatsApp</h2>
          <p className={styles.sectionDesc}>Conectá tu WhatsApp para enviar mensajes automáticos a tus clientes</p>
        </div>
        <div className={styles.fields}>
          <Field label="Conexión WhatsApp">
            {settings.baileysConnected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#22c55e', fontWeight: 600 }}>● Conectado</span>
                <button
                  className={styles.btnDanger}
                  onClick={handleBaileysDisconnect}
                  type="button"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Escaneá el código QR con tu WhatsApp para conectar tu número. El código expira cada 20 segundos y se actualiza automáticamente.
                </p>
                {qrError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px' }}>{qrError}</p>
                )}
                {qrImage ? (
                  <img src={qrImage} alt="QR WhatsApp" style={{ width: '200px', height: '200px', borderRadius: '8px', display: 'block' }} />
                ) : (
                  <button
                    className={styles.btnSave}
                    onClick={startQRScan}
                    disabled={qrLoading}
                    type="button"
                  >
                    {qrLoading ? 'Generando QR...' : 'Conectar WhatsApp'}
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>
      </section>

      {/* SISTEMA INMOBILIARIA — solo visible si el tenant tiene has_inmobiliaria_integration=true */}
      {settings.hasInmobiliariaIntegration && <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sistema inmobiliaria</h2>
          <p className={styles.sectionDesc}>Enviá las citas agendadas automáticamente al sistema de gestión inmobiliaria</p>
        </div>
        <div className={styles.fields}>
          <Field label="Sincronización de visitas">
            <div className={styles.switchRow}>
              <Switch checked={settings.gonzalezSoroWebhookEnabled} onChange={v => set('gonzalezSoroWebhookEnabled', v)} />
              <span className={styles.switchLabel}>
                {settings.gonzalezSoroWebhookEnabled ? 'Activo — las citas se envían al sistema inmobiliario' : 'Inactivo'}
              </span>
            </div>
          </Field>
          <Field label="Envío de WhatsApp por Autoagenda" hint="Permite que el sistema inmobiliario use tu sesión de WhatsApp para enviar encuestas a visitantes.">
            <div className={styles.switchRow}>
              <Switch checked={settings.gonzalezSoroWhatsappEnabled} onChange={v => set('gonzalezSoroWhatsappEnabled', v)} />
              <span className={styles.switchLabel}>
                {settings.gonzalezSoroWhatsappEnabled ? 'Activo — el sistema inmobiliario puede enviar mensajes por tu WhatsApp' : 'Inactivo'}
              </span>
            </div>
          </Field>
        </div>
      </section>}

      {/* ZONA DE PELIGRO */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} style={{ color: 'var(--red)' }}>Zona de peligro</h2>
          <p className={styles.sectionDesc}>Esta acción es irreversible. Se eliminarán todos los datos de tu cuenta.</p>
        </div>
        <div className={styles.fields}>
          <Field label="Eliminar cuenta" hint="Escribí ELIMINAR para confirmar y luego presioná el botón.">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className={styles.input}
                placeholder="Escribí ELIMINAR"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <button
                className={styles.btnDanger}
                disabled={deleteConfirm !== 'ELIMINAR' || deleting}
                onClick={handleDeleteAccount}
              >
                {deleting ? 'Eliminando...' : 'Eliminar cuenta'}
              </button>
            </div>
          </Field>
        </div>
      </section>

      <div className={styles.saveBar}>
        <div className={styles.saveStatus}>
          {error && <span className={styles.errorText}>{error}</span>}
          {!error && saved && <span className={styles.savedText}>✓ Guardado automáticamente</span>}
          {!error && saving && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Guardando...</span>}
        </div>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          Guardar ahora
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
