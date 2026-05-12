'use client';

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

function isoToArgentina(isoString) {
  const d = new Date(isoString);
  const argMs = d.getTime() + (-3 * 60 * 60 * 1000);
  const argDate = new Date(argMs);
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${argDate.getUTCFullYear()}-${pad(argDate.getUTCMonth() + 1)}-${pad(argDate.getUTCDate())}`,
    time: `${pad(argDate.getUTCHours())}:${pad(argDate.getUTCMinutes())}`,
  };
}

function argentinaToIso(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours + 3, minutes)).toISOString();
}

export default function EditAppointmentModal({ event, onSaved, onClose }) {
  const [contacts, setContacts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const initial = isoToArgentina(event.start);
  const [schedDay,  setSchedDay]  = useState(initial.date.split('-')[2]);
  const [schedMonth,setSchedMonth]= useState(initial.date.split('-')[1]);
  const [schedYear, setSchedYear] = useState(initial.date.split('-')[0]);
  const [schedHour, setSchedHour] = useState(initial.time.split(':')[0]);
  const [schedMin,  setSchedMin]  = useState(initial.time.split(':')[1]);
  const [contactId, setContactId]     = useState('');
  const [serviceId, setServiceId]     = useState('');
  const [notes, setNotes]             = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [c, s] = await Promise.all([api.get('/contacts'), api.get('/services')]);
        const contactList = c.data || [];
        const serviceList = s.data || [];
        setContacts(contactList);
        setServices(serviceList);

        // Pre-fill from DB appointment if available
        if (event.appointmentId) {
          const { data: appt } = await api.get(`/appointments/${event.appointmentId}`);
          setContactId(appt.contactId || (contactList[0]?.id ?? ''));
          setServiceId(appt.serviceId || (serviceList[0]?.id ?? ''));
          setNotes(appt.notes || '');
        } else {
          setContactId(contactList[0]?.id ?? '');
          setServiceId(serviceList[0]?.id ?? '');
        }
      } catch {
        setError('Error al cargar datos.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [event.appointmentId]);

  async function handleSave() {
    if (!schedDay || !schedMonth || !schedYear || !schedHour || !schedMin) { setError('La fecha y hora son requeridas.'); return; }
    const schedDate = `${schedYear}-${schedMonth}-${schedDay}`;
    setError('');
    setSaving(true);
    try {
      await api.put(`/appointments/${event.appointmentId}`, {
        scheduledAt: argentinaToIso(schedDate, `${schedHour}:${schedMin}`),
        contactId,
        serviceId,
        notes,
      });
      onSaved();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              Editar cita
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{event.title}</div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Fecha</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={schedDay} onChange={e => setSchedDay(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select value={schedMonth} onChange={e => setSchedMonth(e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                  {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                    <option key={m} value={m}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i]}</option>
                  ))}
                </select>
                <select value={schedYear} onChange={e => setSchedYear(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {[2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Hora</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={schedHour} onChange={e => setSchedHour(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select value={schedMin} onChange={e => setSchedMin(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                  {[...new Set(['00','05','10','15','20','25','30','35','40','45','50','55', schedMin])].sort().map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Contacto</label>
              <select value={contactId} onChange={e => setContactId(e.target.value)} style={selectStyle}>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Servicio</label>
              <select value={serviceId} onChange={e => setServiceId(e.target.value)} style={selectStyle}>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Notas</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Notas internas sobre la cita..."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8, marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || loading} style={primaryBtn}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 16, padding: 28, width: '100%', maxWidth: 480,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};

const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 18, color: 'var(--text-3)', padding: '4px 8px', borderRadius: 8,
};

const labelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
  colorScheme: 'dark',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238b8fa8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  cursor: 'pointer',
};

const primaryBtn = {
  padding: '10px 24px', background: 'var(--gradient)', color: '#fff',
  border: 'none', borderRadius: 100, fontWeight: 700, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};

const secondaryBtn = {
  padding: '10px 20px', background: 'none', border: '1px solid var(--border)',
  color: 'var(--text-2)', borderRadius: 100, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};
