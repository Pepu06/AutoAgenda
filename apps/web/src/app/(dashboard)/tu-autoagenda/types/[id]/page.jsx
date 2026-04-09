'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../../lib/api';
import styles from '../../tu-autoagenda.module.css';

const MIN_NOTICE_OPTIONS = [
  { value: 0,  label: 'No hay mínimo, invitados pueden reservar de inmediato' },
  { value: 1,  label: '1 hora de anticipación' },
  { value: 2,  label: '2 horas de anticipación' },
  { value: 4,  label: '4 horas de anticipación' },
  { value: 8,  label: '8 horas de anticipación' },
  { value: 12, label: '12 horas de anticipación' },
  { value: 24, label: '24 horas de anticipación' },
  { value: 48, label: '48 horas de anticipación' },
];

const MAX_DAYS_OPTIONS = [
  { value: null, label: 'Pueden reservar cualquier día en el futuro' },
  { value: 7,    label: '7 días en el futuro' },
  { value: 14,   label: '14 días en el futuro' },
  { value: 30,   label: '30 días en el futuro' },
  { value: 60,   label: '60 días en el futuro' },
  { value: 90,   label: '90 días en el futuro' },
];

const EMPTY_FORM = {
  title: '', description: '', durationMinutes: 30,
  scheduleId: '', serviceId: '', googleCalendarId: '',
  minHoursBeforeBooking: 0, maxDaysInFuture: null,
  maxConcurrentBookings: 1, extraQuestions: [],
};

export default function TypeFormPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const router = useRouter();

  const [form, setForm]         = useState(EMPTY_FORM);
  const [schedules, setSchedules] = useState([]);
  const [services, setServices]   = useState([]);
  const [gcalendars, setGcalendars] = useState([]);
  const [loading, setLoading]     = useState(!isNew);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    // Load supporting data in parallel
    Promise.all([
      api.get('/autoagenda/schedules').then(r => setSchedules(r.data || [])).catch(() => {}),
      api.get('/services').then(r => setServices(r.data || [])).catch(() => {}),
      api.get('/autoagenda/google-calendars').then(r => setGcalendars(r.data || [])).catch(() => {}),
    ]).then(() => {
      if (!isNew) {
        api.get(`/autoagenda/types/${id}`)
          .then(r => {
            const d = r.data;
            setForm({
              title:                 d.title || '',
              description:           d.description || '',
              durationMinutes:       d.durationMinutes || 30,
              scheduleId:            d.scheduleId || '',
              serviceId:             d.serviceId || '',
              googleCalendarId:      d.googleCalendarId || '',
              minHoursBeforeBooking: d.minHoursBeforeBooking ?? 0,
              maxDaysInFuture:       d.maxDaysInFuture ?? null,
              maxConcurrentBookings: d.maxConcurrentBookings || 1,
              extraQuestions:        d.extraQuestions || [],
            });
          })
          .catch(() => router.push('/tu-autoagenda'))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [id]);

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function addQuestion() {
    setField('extraQuestions', [...form.extraQuestions, { id: crypto.randomUUID(), label: '', required: false }]);
  }

  function updateQuestion(idx, key, val) {
    const next = form.extraQuestions.map((q, i) => i === idx ? { ...q, [key]: val } : q);
    setField('extraQuestions', next);
  }

  function removeQuestion(idx) {
    setField('extraQuestions', form.extraQuestions.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('El título es requerido.'); return; }
    if (!form.scheduleId)   { setError('Selecciona un horario.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        title:                 form.title.trim(),
        description:           form.description || null,
        durationMinutes:       Number(form.durationMinutes),
        scheduleId:            form.scheduleId,
        serviceId:             form.serviceId || undefined,
        googleCalendarId:      form.googleCalendarId || null,
        minHoursBeforeBooking: Number(form.minHoursBeforeBooking),
        maxDaysInFuture:       form.maxDaysInFuture ? Number(form.maxDaysInFuture) : null,
        maxConcurrentBookings: Number(form.maxConcurrentBookings) || 1,
        extraQuestions:        form.extraQuestions.filter(q => q.label.trim()),
      };
      if (isNew) {
        await api.post('/autoagenda/types', payload);
      } else {
        await api.put(`/autoagenda/types/${id}`, payload);
      }
      router.push('/tu-autoagenda');
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="spinnerWrap"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.push('/tu-autoagenda')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 22, padding: '0 4px', lineHeight: 1 }}
        >←</button>
        <h1 className={styles.pageTitle} style={{ margin: 0 }}>
          {isNew ? 'Crear tipo de cita' : 'Editar tipo de cita'}
        </h1>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Configuración */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Configuración</h2>

          <div className={styles.field}>
            <label className={styles.label}>Título</label>
            <input className={styles.input} placeholder="Reunión de 30 minutos" value={form.title} onChange={e => setField('title', e.target.value)} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descripción</label>
            <textarea className={styles.textarea} placeholder="Usa esto para compartir sobre..." value={form.description} onChange={e => setField('description', e.target.value)} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Duración en minutos</label>
            <input
              type="number" min="5" step="5"
              className={styles.input}
              style={{ maxWidth: 200 }}
              value={form.durationMinutes}
              onChange={e => setField('durationMinutes', e.target.value)}
            />
          </div>

          {gcalendars.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Calendario en el cual se crearán citas</label>
              <select className={styles.input} value={form.googleCalendarId} onChange={e => setField('googleCalendarId', e.target.value)}>
                <option value="">Seleccionar calendario</option>
                {gcalendars.map(c => (
                  <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (principal)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {services.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Asociar a servicio (opcional)</label>
              <select className={styles.input} value={form.serviceId} onChange={e => setField('serviceId', e.target.value)}>
                <option value="">Sin asociación (se creará uno automáticamente)</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.durationMinutes} min</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Disponibilidad */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Disponibilidad</h2>

          <div className={styles.field}>
            <label className={styles.label}>¿En qué horario estás disponible para este tipo de cita?</label>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>Para crear o editar horarios vuelve a la página anterior.</p>
            <select className={styles.input} value={form.scheduleId} onChange={e => setField('scheduleId', e.target.value)}>
              <option value="">Seleccionar horario</option>
              {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Mínimo número de horas de anticipación para reservar</label>
            <select className={styles.input} value={form.minHoursBeforeBooking} onChange={e => setField('minHoursBeforeBooking', Number(e.target.value))}>
              {MIN_NOTICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Cuántos días en el futuro se puede reservar</label>
            <select className={styles.input} value={form.maxDaysInFuture ?? ''} onChange={e => setField('maxDaysInFuture', e.target.value === '' ? null : Number(e.target.value))}>
              {MAX_DAYS_OPTIONS.map(o => <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Cuántas citas de este tipo puedes atender a la misma hora</label>
            <input
              type="number" min="1" max="50"
              className={styles.input}
              style={{ maxWidth: 100 }}
              value={form.maxConcurrentBookings}
              onChange={e => setField('maxConcurrentBookings', e.target.value)}
            />
          </div>
        </div>

        {/* Preguntas extras */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Preguntas extras</h2>
              <p className={styles.sectionSub} style={{ marginBottom: 0 }}>
                Crea preguntas adicionales que tus clientes deben responder al momento de agendar la cita. Las respuestas saldrán en las notas de la cita en el calendario de Confirmafy.
              </p>
            </div>
            <button type="button" className={styles.btnSecondary} onClick={addQuestion}>Agregar pregunta</button>
          </div>

          {form.extraQuestions.map((q, idx) => (
            <div key={q.id || idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                className={styles.input}
                placeholder="Pregunta (ej: ¿Tema de la reunión?)"
                value={q.label}
                onChange={e => updateQuestion(idx, 'label', e.target.value)}
                style={{ flex: 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={q.required} onChange={e => updateQuestion(idx, 'required', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                Requerida
              </label>
              <button type="button" onClick={() => removeQuestion(idx)} className={styles.btnDanger}>✕</button>
            </div>
          ))}
        </div>

        {/* Save */}
        <div className={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar tipo de cita'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
