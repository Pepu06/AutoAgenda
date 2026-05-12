'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import styles from './appointments.module.css';
import tableStyles from '../../../components/appointments/AppointmentTable.module.css';
import EditAppointmentModal from '../../../components/appointments/EditAppointmentModal';

const STATUS_FALLBACK = { label: 'Sin enviar', color: 'var(--text-3)', bg: 'var(--surface-3)' };

const STATUS_CONFIG = {
  sin_enviar: STATUS_FALLBACK,
  pending:   { label: 'Pendiente',  color: 'var(--yellow)',  bg: 'var(--yellow-bg)' },
  notified:  { label: 'Notificado', color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  confirmed: { label: 'Confirmado', color: 'var(--green)',   bg: 'var(--green-bg)' },
  cancelled: { label: 'Cancelado',  color: 'var(--red)',     bg: 'var(--red-bg)' },
};

export default function AppointmentsPage() {
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [connected, setConnected]   = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/calendar/events');
      setConnected(res.connected !== false);
      setEvents(res.data || []);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    fetchEvents().finally(() => setLoading(false));
  }, [fetchEvents]);

  async function handleStatusChange(eventId, status) {
    await api.patch(`/calendar/events/${eventId}/status`, { status });
    fetchEvents();
  }

  const filtered = events.filter(e => {
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterDate) {
      const eventDate = new Date(e.start).toISOString().slice(0, 10);
      if (eventDate !== filterDate) return false;
    }
    return true;
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Citas</h1>
      </div>

      <div className={styles.filters}>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className={styles.filterInput}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={styles.filterInput}
        >
          <option value="">Todos los estados</option>
          <option value="notified">Notificado</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        {(filterDate || filterStatus) && (
          <button className={styles.btnClear} onClick={() => { setFilterDate(''); setFilterStatus(''); }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="spinnerWrap"><div className="spinner" /></div>
      ) : !connected ? (
        <div className={tableStyles.empty}>
          Conectá Google Calendar desde la sección <a href="/calendar" style={{ color: 'var(--accent)' }}>Google Calendar</a> para ver tus citas.
        </div>
      ) : filtered.length === 0 ? (
        <div className={tableStyles.empty}>No hay citas para mostrar.</div>
      ) : (
        <div className={tableStyles.wrapper}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Cita</th>
                <th>Teléfono</th>
                <th>Fecha y hora</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const s = STATUS_CONFIG[e.status] ?? STATUS_FALLBACK;
                return (
                  <tr key={e.id}>
                    <td>
                      <span className={tableStyles.contactName}>{e.title}</span>
                      {e.attendees?.length > 0 && (
                        <span className={tableStyles.contactPhone}>
                          {e.attendees.map(a => a.name || a.email).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className={tableStyles.contactPhone}>{e.phone}</td>
                    <td>
                      {new Date(e.start).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        hour12: false,
                      })}
                      {e.isAllDay && <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 6 }}>Todo el día</span>}
                    </td>
                    <td>
                      <span className={tableStyles.badge} style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          value={e.status ?? ''}
                          onChange={ev => handleStatusChange(e.id, ev.target.value)}
                          className={tableStyles.select}
                        >
                          <option value="sin_enviar">Sin enviar</option>
                          <option value="notified">Notificado</option>
                          <option value="pending">Pendiente</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                        {e.appointmentId && (
                          <button
                            onClick={() => setEditingEvent(e)}
                            style={editBtnStyle}
                            title="Editar cita"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingEvent && (
        <EditAppointmentModal
          event={editingEvent}
          onSaved={() => { setEditingEvent(null); fetchEvents(); }}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

const editBtnStyle = {
  padding: '6px 14px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 100,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'border-color 0.15s, color 0.15s',
};
