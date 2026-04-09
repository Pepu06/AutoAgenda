'use client';

import { useState, useEffect } from 'react';
import { api } from '../../../../lib/api';

const DAYS = [
  { label: 'Domingo',   dow: 0 },
  { label: 'Lunes',     dow: 1 },
  { label: 'Martes',    dow: 2 },
  { label: 'Miércoles', dow: 3 },
  { label: 'Jueves',    dow: 4 },
  { label: 'Viernes',   dow: 5 },
  { label: 'Sábado',    dow: 6 },
];

const HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  const pad = String(h).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: `${pad}:${m}`, label: `${h12}:${m} ${ampm}` };
});

function makeEmptyDays() {
  return Object.fromEntries(DAYS.map(d => [d.dow, { enabled: false, blocks: [{ startTime: '09:00', endTime: '17:00' }] }]));
}

function rulesToDays(rules = []) {
  const days = makeEmptyDays();
  for (const rule of rules) {
    if (!days[rule.dayOfWeek]) continue;
    days[rule.dayOfWeek].enabled = true;
    if (days[rule.dayOfWeek].blocks.length === 1 && !days[rule.dayOfWeek].blocks[0]._used) {
      days[rule.dayOfWeek].blocks = [{ startTime: rule.startTime, endTime: rule.endTime }];
      days[rule.dayOfWeek].blocks[0]._used = true;
    } else {
      days[rule.dayOfWeek].blocks.push({ startTime: rule.startTime, endTime: rule.endTime });
    }
  }
  return days;
}

function daysToRules(days) {
  const rules = [];
  for (const [dow, day] of Object.entries(days)) {
    if (!day.enabled) continue;
    for (const block of day.blocks) {
      rules.push({ dayOfWeek: Number(dow), startTime: block.startTime, endTime: block.endTime });
    }
  }
  return rules;
}

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  // Pad start (Monday=0 convention — shift so Monday is first)
  const startDow = (first.getDay() + 6) % 7; // 0=Mon
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function ScheduleModal({ schedule, onSaved, onClose }) {
  const [name, setName]       = useState(schedule?.name || '');
  const [tab, setTab]         = useState('regular'); // 'regular' | 'exceptions'
  const [days, setDays]       = useState(makeEmptyDays());
  const [exceptions, setExceptions] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Calendar state for exceptions
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDates, setSelectedDates] = useState([]);
  const [excAvailability, setExcAvailability] = useState('blocked'); // 'blocked' | 'available'

  useEffect(() => {
    if (schedule?.rules) {
      setDays(rulesToDays(schedule.rules));
    }
    if (schedule?.exceptions) {
      setExceptions(schedule.exceptions.map(e => ({
        date: typeof e.date === 'string' ? e.date.slice(0, 10) : dateToStr(new Date(e.date)),
        isBlocked: e.isBlocked,
        startTime: e.startTime || null,
        endTime: e.endTime || null,
      })));
    }
  }, [schedule]);

  function setDayEnabled(dow, val) {
    setDays(prev => ({ ...prev, [dow]: { ...prev[dow], enabled: val } }));
  }

  function setBlock(dow, idx, field, val) {
    setDays(prev => {
      const blocks = prev[dow].blocks.map((b, i) => i === idx ? { ...b, [field]: val } : b);
      return { ...prev, [dow]: { ...prev[dow], blocks } };
    });
  }

  function addBlock(dow) {
    setDays(prev => {
      const last = prev[dow].blocks[prev[dow].blocks.length - 1];
      const newBlock = { startTime: last?.endTime || '14:00', endTime: '18:00' };
      return { ...prev, [dow]: { ...prev[dow], blocks: [...prev[dow].blocks, newBlock] } };
    });
  }

  function removeBlock(dow, idx) {
    setDays(prev => {
      const blocks = prev[dow].blocks.filter((_, i) => i !== idx);
      return { ...prev, [dow]: { ...prev[dow], blocks: blocks.length ? blocks : [{ startTime: '09:00', endTime: '17:00' }] } };
    });
  }

  // Calendar helpers
  function toggleDate(d) {
    const str = dateToStr(d);
    setSelectedDates(prev => prev.includes(str) ? prev.filter(x => x !== str) : [...prev, str]);
  }

  function applyExceptions() {
    if (!selectedDates.length) return;
    setExceptions(prev => {
      const next = [...prev.filter(e => !selectedDates.includes(e.date))];
      for (const date of selectedDates) {
        next.push({ date, isBlocked: excAvailability === 'blocked', startTime: null, endTime: null });
      }
      return next;
    });
    setSelectedDates([]);
  }

  function removeException(date) {
    setExceptions(prev => prev.filter(e => e.date !== date));
  }

  async function handleSave() {
    if (!name.trim()) { setError('El nombre es requerido.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = { name: name.trim(), rules: daysToRules(days), exceptions };
      if (schedule?.id) {
        await api.put(`/autoagenda/schedules/${schedule.id}`, payload);
      } else {
        await api.post('/autoagenda/schedules', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  const calDays = getMonthDays(calYear, calMonth);
  const exceptionMap = Object.fromEntries(exceptions.map(e => [e.date, e]));

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
              Edita tu horario laboral
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
              Este horario determina las horas en las que tus clientes pueden agendar su cita.
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Nombre del horario</label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ej: Lunes a Viernes"
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {['regular', 'exceptions'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: tab === t ? 700 : 400,
                color: tab === t ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer',
                fontSize: 13.5,
                marginBottom: -1,
              }}
            >
              {t === 'regular' ? 'Horario regular' : 'Modificar por fecha'}
            </button>
          ))}
        </div>

        {/* Regular tab */}
        {tab === 'regular' && (
          <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
            {DAYS.map(({ label, dow }) => {
              const day = days[dow];
              return (
                <div key={dow} style={dayCard}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: day.enabled ? 10 : 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{label}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}>
                      ¿Disponible?
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={e => setDayEnabled(dow, e.target.checked)}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                      />
                    </label>
                  </div>
                  {day.enabled && day.blocks.map((block, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>De</span>
                      <select
                        value={block.startTime}
                        onChange={e => setBlock(dow, idx, 'startTime', e.target.value)}
                        style={selectStyle}
                      >
                        {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                      </select>
                      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>a</span>
                      <select
                        value={block.endTime}
                        onChange={e => setBlock(dow, idx, 'endTime', e.target.value)}
                        style={selectStyle}
                      >
                        {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                      </select>
                      {day.blocks.length > 1 && (
                        <button onClick={() => removeBlock(dow, idx)} style={smallBtn}>−</button>
                      )}
                      {idx === day.blocks.length - 1 && (
                        <button onClick={() => addBlock(dow)} style={smallBtn}>+</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Exceptions tab */}
        {tab === 'exceptions' && (
          <div>
            {/* Calendar */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y--; } setCalMonth(m); setCalYear(y); }} style={navBtn}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{MONTH_NAMES[calMonth]} {calYear}</span>
                <button onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++; } setCalMonth(m); setCalYear(y); }} style={navBtn}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 8 }}>
                {['lu','ma','mi','ju','vi','sá','do'].map(d => (
                  <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', padding: '4px 0' }}>{d}</div>
                ))}
                {calDays.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const str = dateToStr(d);
                  const selected = selectedDates.includes(str);
                  const hasExc = exceptionMap[str];
                  return (
                    <button
                      key={i}
                      onClick={() => toggleDate(d)}
                      style={{
                        padding: '6px 0',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: selected ? 700 : 400,
                        background: selected ? 'var(--accent)' : hasExc ? (hasExc.isBlocked ? 'var(--red-bg)' : 'var(--accent-bg)') : 'transparent',
                        color: selected ? '#fff' : hasExc ? (hasExc.isBlocked ? 'var(--red)' : 'var(--accent)') : 'var(--text)',
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Availability radios */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Disponibilidad</div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 20, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="exc_avail" value="blocked" checked={excAvailability === 'blocked'} onChange={() => setExcAvailability('blocked')} style={{ accentColor: 'var(--accent)' }} />
                No Disponible
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="exc_avail" value="available" checked={excAvailability === 'available'} onChange={() => setExcAvailability('available')} style={{ accentColor: 'var(--accent)' }} />
                Disponible
              </label>
            </div>

            <button
              onClick={applyExceptions}
              disabled={!selectedDates.length}
              style={{
                width: '100%', padding: '11px', background: selectedDates.length ? 'var(--accent)' : 'var(--surface-2)',
                color: selectedDates.length ? '#fff' : 'var(--text-3)',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: selectedDates.length ? 'pointer' : 'not-allowed',
                marginBottom: 16,
              }}
            >
              Aplicar horario a fechas seleccionadas
            </button>

            {/* List of existing exceptions */}
            {exceptions.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Excepciones guardadas
                </div>
                {exceptions.map(e => (
                  <div key={e.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 13 }}>
                      {e.date}{' '}
                      <span style={{ color: e.isBlocked ? 'var(--red)' : 'var(--accent)', fontWeight: 600 }}>
                        {e.isBlocked ? '● No disponible' : '● Disponible'}
                      </span>
                    </span>
                    <button onClick={() => removeException(e.date)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8, marginTop: 12 }}>{error}</div>}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cerrar</button>
          <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline styles for simplicity
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};

const modal = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  padding: '28px',
  width: '100%',
  maxWidth: '540px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 18, color: 'var(--text-3)', padding: '4px 8px', borderRadius: 8,
};

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
};

const selectStyle = {
  padding: '7px 32px 7px 10px', background: 'var(--surface-2)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, color: 'var(--text)', cursor: 'pointer', outline: 'none',
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238b8fa8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

const smallBtn = {
  width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--surface)',
  borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--text-3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const navBtn = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-2)', padding: '4px 8px',
};

const dayCard = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '14px 16px', marginBottom: 10,
};

const primaryBtnStyle = {
  padding: '10px 24px', background: 'var(--gradient)', color: '#fff',
  border: 'none', borderRadius: 100, fontWeight: 700, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};

const secondaryBtnStyle = {
  padding: '10px 20px', background: 'none', border: '1px solid var(--border)',
  color: 'var(--text-2)', borderRadius: 100, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};
