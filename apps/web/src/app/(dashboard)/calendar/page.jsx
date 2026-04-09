'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { api } from '../../../lib/api';
import styles from './calendar.module.css';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const STATUS_META = {
  pending:   { label: 'Pendiente',  color: '#f59e0b' },
  notified:  { label: 'Notificado', color: '#0ea5e9' },
  confirmed: { label: 'Confirmado', color: '#22c55e' },
  cancelled: { label: 'Cancelado',  color: '#ef4444' },
};

function getStatusMeta(status) {
  return STATUS_META[status] || { label: 'Sin enviar', color: '#7C6EF8' };
}

function buildMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ number: d, dateStr });
  }
  while (days.length % 7 !== 0) days.push(null);
  return { year, month, days };
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end) - new Date(start);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function GoogleCalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const EMPTY_CREATE = { contactId: '', serviceId: '', scheduledAt: '', notes: '', location: '' };

export default function CalendarPage() {
  const [connected, setConnected]     = useState(false);
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [reminding, setReminding]     = useState(null);
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(EMPTY_CREATE);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');
  const [contacts, setContacts]       = useState([]);
  const [services, setServices]       = useState([]);
  const [locationMode, setLocationMode] = useState('fixed');

  // Default calendar state
  const [calendars, setCalendars]               = useState([]);
  const [defaultCalendarId, setDefaultCalendarId] = useState('primary');
  const [savingDefault, setSavingDefault]         = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await api.get('/calendar/status');
    setConnected(res.data.connected);
  }, []);

  const fetchEvents = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api.get('/calendar/events');
      setEvents(res.data || []);
      setConnected(res.connected !== false);
    } catch { }
    finally { setSyncing(false); }
  }, []);

  const fetchCalendarsAndDefault = useCallback(async () => {
    try {
      const [cals, def] = await Promise.all([
        api.get('/autoagenda/google-calendars'),
        api.get('/calendar/default'),
      ]);
      setCalendars(cals.data || []);
      setDefaultCalendarId(def.data?.calendarId || 'primary');
    } catch { /* GCal not connected yet */ }
  }, []);

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
  }, [fetchStatus]);

  useEffect(() => {
    if (connected) {
      fetchEvents();
      fetchCalendarsAndDefault();
    }
  }, [connected, fetchEvents, fetchCalendarsAndDefault]);

  async function saveDefaultCalendar(calId) {
    setDefaultCalendarId(calId);
    setSavingDefault(true);
    try {
      await api.put('/calendar/default', { calendarId: calId });
    } catch (err) {
      alert(err.message || 'Error al guardar el calendario predeterminado');
    } finally {
      setSavingDefault(false);
    }
  }

  const connectCalendar = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    onSuccess: async ({ code }) => {
      await api.post('/calendar/connect', { code });
      setConnected(true);
    },
    onError: () => alert('Error al conectar Google Calendar'),
  });

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Google Calendar?')) return;
    await api.post('/calendar/disconnect');
    setConnected(false);
    setEvents([]);
  }

  async function openCreate() {
    const promises = [
      contacts.length ? Promise.resolve({ data: contacts }) : api.get('/contacts'),
      services.length ? Promise.resolve({ data: services }) : api.get('/services'),
      api.get('/settings'),
    ];
    const [c, s, settings] = await Promise.all(promises);
    if (!contacts.length) setContacts(c.data || []);
    if (!services.length) setServices(s.data || []);
    setLocationMode(settings.data?.locationMode || 'fixed');
    setCreateForm({ ...EMPTY_CREATE, scheduledAt: selectedDate ? `${selectedDate}T09:00` : '' });
    setCreateError('');
    setShowCreate(true);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const scheduledAt = createForm.scheduledAt ? createForm.scheduledAt + ':00-03:00' : createForm.scheduledAt;
      await api.post('/calendar/events', { ...createForm, scheduledAt });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      await fetchEvents();
    } catch (err) {
      setCreateError(err.message || 'Error al crear la cita');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemind(eventId) {
    setReminding(eventId);
    try {
      await api.post(`/calendar/remind/${eventId}`);
      await fetchEvents();
    } catch (err) {
      alert(err.message || 'Error al enviar recordatorio');
    } finally {
      setReminding(null);
    }
  }

  async function handleTransferChange(appointmentId, confirmed) {
    try {
      await api.patch(`/appointments/${appointmentId}/transfer`, { transferConfirmed: confirmed });
      // Update local event state
      setEvents(prev => prev.map(ev =>
        ev.appointmentId === appointmentId ? { ...ev, transferConfirmed: confirmed } : ev
      ));
      setSelectedEvent(prev =>
        prev?.appointmentId === appointmentId ? { ...prev, transferConfirmed: confirmed } : prev
      );
    } catch (err) {
      alert(err.message || 'Error al actualizar transferencia');
    }
  }

  const { year, month, days } = useMemo(() => buildMonth(currentDate), [currentDate]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const d = ev.start?.slice(0, 10);
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() =>
    events
      .filter(e => e.start?.slice(0, 10) === selectedDate)
      .sort((a, b) => new Date(a.start) - new Date(b.start)),
    [events, selectedDate]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  function prevMonth() {
    setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  }
  function nextMonth() {
    setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });
  }

  if (loading) return <div className="spinnerWrap"><div className="spinner" /></div>;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Calendario</h1>
          <p className={styles.subtitle}>
            {connected ? 'Vista mensual de tus citas' : 'Conectá tu Google Calendar para sincronizar eventos'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {connected ? (
            <>
              <button className={styles.btnSync} onClick={openCreate}>+ Nueva cita</button>
              <button className={styles.btnSync} onClick={fetchEvents} disabled={syncing}>
                {syncing ? 'Sincronizando...' : '↻ Sincronizar'}
              </button>
              <button className={styles.btnDisconnect} onClick={handleDisconnect}>Desconectar</button>
            </>
          ) : (
            <button
              className={styles.btnConnect}
              onClick={() => connectCalendar()}
              data-tour="gcal-connect"
            >
              <GoogleCalIcon /> Conectar Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Default calendar selector — shown when connected and calendars loaded */}
      {connected && calendars.length > 0 && (
        <div
          data-tour="gcal-default"
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              Calendario predeterminado
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Las citas nuevas se crean en este calendario
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={defaultCalendarId}
              onChange={e => saveDefaultCalendar(e.target.value)}
              disabled={savingDefault}
              style={{
                padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {calendars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.summary}{c.primary ? ' (principal)' : ''}
                </option>
              ))}
            </select>
            {savingDefault && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Guardando...</span>}
          </div>
        </div>
      )}

      {!connected ? (
        <div className={styles.connectCard}>
          <div className={styles.connectIcon}><GoogleCalIcon /></div>
          <h2 className={styles.connectTitle}>Sincronizá tu calendario</h2>
          <p className={styles.connectDesc}>
            Conectá Google Calendar para ver tus citas y enviar recordatorios automáticos por WhatsApp.
          </p>
          <button className={styles.btnConnect} onClick={() => connectCalendar()} data-tour="gcal-connect">
            Conectar Google Calendar
          </button>
        </div>
      ) : (
        <div className={styles.calendarLayout}>
          {/* Left: month grid */}
          <div className={styles.gridPanel}>
            <div className={styles.monthNav}>
              <div className={styles.monthSelectors}>
                <div className={styles.selectWrap}>
                  <select
                    className={styles.monthSelect}
                    value={month}
                    onChange={e => setCurrentDate(d => { const n = new Date(d); n.setMonth(Number(e.target.value)); return n; })}
                  >
                    {MONTH_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                  </select>
                  <span className={styles.selectChevron}>▾</span>
                </div>
                <div className={styles.selectWrap}>
                  <select
                    className={styles.yearSelect}
                    value={year}
                    onChange={e => setCurrentDate(d => { const n = new Date(d); n.setFullYear(Number(e.target.value)); return n; })}
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className={styles.selectChevron}>▾</span>
                </div>
              </div>
              <div className={styles.navBtns}>
                <button className={styles.navBtn} onClick={prevMonth}>←</button>
                <button className={styles.navBtn} onClick={nextMonth}>→</button>
              </div>
            </div>

            <div className={styles.weekDays}>
              {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                <div key={d} className={styles.weekDay}>{d}</div>
              ))}
            </div>

            <div className={styles.gridDays}>
              {days.map((day, i) => (
                <DayCell
                  key={i}
                  day={day}
                  events={day ? (eventsByDate[day.dateStr] || []) : []}
                  isSelected={day?.dateStr === selectedDate}
                  isToday={day?.dateStr === todayStr}
                  onDayClick={() => day && setSelectedDate(day.dateStr)}
                  onEventClick={ev => { setSelectedDate(day.dateStr); setSelectedEvent(ev); }}
                />
              ))}
            </div>
          </div>

          {/* Right: scheduled panel */}
          <div className={styles.sidebarPanel}>
            <div className={styles.sidebarHeader}>
              <div>
                <div className={styles.sidebarTitle}>Programado</div>
                <div className={styles.sidebarDate}>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </div>
              </div>
              <div className={styles.sidebarNav}>
                <button className={styles.sidebarNavBtn} onClick={() => {
                  const d = new Date(selectedDate + 'T12:00:00');
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}>←</button>
                <button className={styles.sidebarNavBtn} onClick={() => {
                  const d = new Date(selectedDate + 'T12:00:00');
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}>→</button>
              </div>
            </div>

            {selectedDayEvents.length === 0 ? (
              <div className={styles.sidebarEmpty}>
                <div className={styles.sidebarEmptyIcon}>📅</div>
                <p>Sin citas este día</p>
              </div>
            ) : (
              <div className={styles.timeline}>
                {selectedDayEvents.map(ev => (
                  <TimelineEvent
                    key={ev.id}
                    event={ev}
                    reminding={reminding === ev.id}
                    onRemind={() => handleRemind(ev.id)}
                    onSelect={() => setSelectedEvent(ev)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event detail popup */}
      {selectedEvent && (
        <EventPopup
          event={selectedEvent}
          reminding={reminding === selectedEvent.id}
          onRemind={() => handleRemind(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onTransferChange={handleTransferChange}
        />
      )}

      {showCreate && (
        <div className={styles.popupBackdrop} onClick={() => setShowCreate(false)}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <div className={styles.popupAccent} style={{ background: '#7C6EF8' }} />
              <h3 className={styles.popupTitle}>Nueva cita</h3>
              <button className={styles.popupClose} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateEvent} className={styles.popupBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contacto</label>
                <select
                  required
                  value={createForm.contactId}
                  onChange={e => setCreateForm(f => ({ ...f, contactId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                >
                  <option value="">Seleccionar contacto...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Servicio</label>
                <select
                  required
                  value={createForm.serviceId}
                  onChange={e => setCreateForm(f => ({ ...f, serviceId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                >
                  <option value="">Seleccionar servicio...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha y hora</label>
                <input
                  type="datetime-local"
                  required
                  value={createForm.scheduledAt}
                  onChange={e => setCreateForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                />
              </div>
              {locationMode === 'calendar' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ubicación del evento (opcional)</label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Ej: Av. Corrientes 1234, CABA"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
                <input
                  type="text"
                  value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ej: Trae estudios previos"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                />
              </div>
              {createError && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{createError}</p>}
              <button
                type="submit"
                disabled={creating}
                className={styles.popupRemindBtn}
              >
                {creating ? 'Creando...' : '+ Crear cita'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({ day, events, isSelected, isToday, onDayClick, onEventClick }) {
  if (!day) return <div className={styles.dayEmpty} />;
  return (
    <div
      className={`${styles.dayCell} ${isSelected ? styles.dayCellSelected : ''} ${isToday ? styles.dayCellToday : ''}`}
      onClick={onDayClick}
    >
      <span className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ''}`}>{day.number}</span>
      <div className={styles.dayPills}>
        {events.slice(0, 3).map(ev => {
          const s = getStatusMeta(ev.status);
          return (
            <div
              key={ev.id}
              className={styles.eventPill}
              title={ev.title}
              onClick={e => { e.stopPropagation(); onEventClick(ev); }}
            >
              <span className={styles.pillDot} style={{ background: s.color }} />
              <span className={styles.pillText}>{ev.title}</span>
            </div>
          );
        })}
        {events.length > 3 && (
          <div className={styles.eventPillMore}>+{events.length - 3} más</div>
        )}
      </div>
    </div>
  );
}

function TimelineEvent({ event, reminding, onRemind, onSelect }) {
  const time = event.isAllDay
    ? 'Todo el día'
    : formatTime(event.start);
  const endTime = event.end && !event.isAllDay ? formatTime(event.end) : null;
  const duration = event.end && event.start ? formatDuration(event.start, event.end) : null;
  const s = getStatusMeta(event.status);

  return (
    <div className={styles.timelineSlot}>
      <div className={styles.timeLabel}>{time}</div>
      <div className={styles.timelineEventCard} onClick={onSelect}>
        <div className={styles.timelineBar} style={{ background: s.color }} />
        <div className={styles.timelineBody}>
          <div className={styles.timelineTitle}>{event.title}</div>
          {event.phone && <div className={styles.timelinePhone}>{event.phone}</div>}
          <div className={styles.timelineFooter}>
            {endTime && <span className={styles.timelineTimeRange}>{time} – {endTime}</span>}
            {duration && <span className={styles.timelineDuration}>{duration}</span>}
          </div>
          <div className={styles.timelineActions}>
            <span className={styles.timelineStatus} style={{ color: s.color }}>{s.label}</span>
            <button
              className={styles.btnRemind}
              disabled={reminding}
              onClick={e => { e.stopPropagation(); onRemind(); }}
            >
              {reminding ? '...' : '↗ WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventPopup({ event, reminding, onRemind, onClose, onTransferChange }) {
  const time = event.isAllDay
    ? 'Todo el día'
    : formatTime(event.start);
  const endTime = event.end && !event.isAllDay ? formatTime(event.end) : null;
  const date = new Date((event.start || '') + (event.isAllDay ? 'T12:00:00' : '')).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const s = getStatusMeta(event.status);

  const [markingTransfer, setMarkingTransfer] = useState(false);

  async function handleMarkTransfer(confirmed) {
    if (!event.appointmentId) return;
    setMarkingTransfer(true);
    try {
      await onTransferChange(event.appointmentId, confirmed);
    } finally {
      setMarkingTransfer(false);
    }
  }

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div className={styles.popup} onClick={e => e.stopPropagation()}>
        <div className={styles.popupHeader}>
          <div className={styles.popupAccent} style={{ background: s.color }} />
          <h3 className={styles.popupTitle}>{event.title}</h3>
          <button className={styles.popupClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.popupBody}>
          <div className={styles.popupField}>
            <span className={styles.popupLabel}>Fecha</span>
            <span className={styles.popupValue} style={{ textTransform: 'capitalize' }}>{date}</span>
          </div>
          <div className={styles.popupField}>
            <span className={styles.popupLabel}>Hora</span>
            <span className={styles.popupValue}>{endTime ? `${time} – ${endTime}` : time}</span>
          </div>
          {event.phone && (
            <div className={styles.popupField}>
              <span className={styles.popupLabel}>Teléfono</span>
              <span className={styles.popupValue}>{event.phone}</span>
            </div>
          )}
          {(() => {
            const notes = (event.description || '')
              .split('\n')
              .filter(l => !/^\[.*\]$/.test(l.trim()))
              .join('\n')
              .trim();
            return notes ? (
              <div className={styles.popupField} style={{ alignItems: 'flex-start' }}>
                <span className={styles.popupLabel}>Notas</span>
                <span className={styles.popupValue} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{notes}</span>
              </div>
            ) : null;
          })()}

          {/* Transfer status — only shown for autoagenda bookings that require transfer */}
          {event.requiresTransfer && (
            <div className={styles.popupField} style={{ alignItems: 'center' }}>
              <span className={styles.popupLabel}>Transferencia</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {event.transferConfirmed ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                    background: '#dcfce7', color: '#166534',
                  }}>
                    ✅ Confirmada
                  </span>
                ) : (
                  <>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                      background: '#fef3c7', color: '#92400e',
                    }}>
                      ⚠️ Pendiente
                    </span>
                    {event.appointmentId && (
                      <button
                        disabled={markingTransfer}
                        onClick={() => handleMarkTransfer(true)}
                        style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                          opacity: markingTransfer ? 0.6 : 1,
                        }}
                      >
                        {markingTransfer ? '...' : 'Marcar como pagado'}
                      </button>
                    )}
                  </>
                )}
                {event.transferConfirmed && event.appointmentId && (
                  <button
                    disabled={markingTransfer}
                    onClick={() => handleMarkTransfer(false)}
                    style={{
                      padding: '4px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: 'none', color: 'var(--text-3)', border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    Deshacer
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={styles.popupField}>
            <span className={styles.popupLabel}>Estado</span>
            <span
              className={styles.popupStatusBadge}
              style={{ color: s.color, borderColor: s.color + '55', background: s.color + '18' }}
            >
              {s.label}
            </span>
          </div>
        </div>
        <button className={styles.popupRemindBtn} disabled={reminding} onClick={onRemind}>
          {reminding ? 'Enviando...' : '↗ Enviar recordatorio por WhatsApp'}
        </button>
      </div>
    </div>
  );
}
