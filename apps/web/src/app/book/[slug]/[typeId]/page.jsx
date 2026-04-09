'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BookTypePage() {
  const { slug, typeId } = useParams();

  const [typeData, setTypeData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);

  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots]               = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');

  const [step, setStep]     = useState('calendar'); // 'calendar' | 'form' | 'done'
  const [form, setForm]     = useState({ name: '', phone: '', email: '', notes: '', answers: {} });
  const [formError, setFormError] = useState('');
  const [booking, setBooking]   = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/public/book/${slug}/types/${typeId}`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) { setNotFound(true); return; }
        setTypeData(json.data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, typeId]);

  useEffect(() => {
    if (!selectedDate || !typeData) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot('');
    fetch(`${API_URL}/public/book/${slug}/types/${typeId}/slots?from=${selectedDate}&to=${selectedDate}`)
      .then(r => r.json())
      .then(json => setSlots(json.data?.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, slug, typeId]);

  async function handleBook(e) {
    e.preventDefault();
    if (!form.name.trim())  { setFormError('El nombre es requerido.'); return; }
    if (!form.phone.trim()) { setFormError('El teléfono es requerido.'); return; }
    setFormError('');
    setBooking(true);
    try {
      const res = await fetch(`${API_URL}/public/book/${slug}/types/${typeId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: selectedSlot,
          name:    form.name.trim(),
          phone:   form.phone.trim(),
          email:   form.email.trim() || undefined,
          notes:   form.notes.trim() || undefined,
          answers: form.answers,
        }),
      });
      const json = await res.json();
      if (!json.success) { setFormError(json.error || 'Error al reservar. Intenta de nuevo.'); return; }
      setConfirmation(json.data);
      setStep('done');
    } catch {
      setFormError('Error de conexión. Intenta de nuevo.');
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 16px', color: '#888' }}>Cargando...</div>;
  if (notFound) return (
    <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
      <p style={{ color: '#888' }}>Esta página no existe.</p>
      <Link href={`/book/${slug}`} style={{ color: '#6366f1', textDecoration: 'none' }}>← Volver</Link>
    </div>
  );

  const profile = typeData?.profile;

  // Header strip
  const Header = () => (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
      {profile?.profileImage && (
        <img src={profile.profileImage} alt="perfil" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
      )}
      <div>
        <div style={{ fontSize: 13, color: '#888' }}>{profile?.title}</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{typeData?.title}</div>
        <div style={{ fontSize: 12.5, color: '#888' }}>{typeData?.durationMinutes} min</div>
      </div>
    </div>
  );

  // Done screen
  if (step === 'done' && confirmation) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '32px 16px' }}>
        <Header />
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h2 style={{ margin: '0 0 8px', color: '#111', fontWeight: 700, fontSize: 20 }}>¡Cita confirmada!</h2>
          <p style={{ color: '#555', margin: '0 0 16px', fontSize: 14, lineHeight: 1.5 }}>
            Tu cita ha sido agendada. Recibirás un mensaje de WhatsApp con la confirmación.
          </p>
          <div style={{ background: '#f5f5f7', borderRadius: 12, padding: '16px', marginBottom: 20, textAlign: 'left', fontSize: 13.5 }}>
            <div><strong>Tipo:</strong> {confirmation.title}</div>
            <div><strong>Fecha y hora:</strong> {fmtDate(confirmation.scheduledAt)}, {fmtTime(confirmation.scheduledAt)}</div>
            <div><strong>Duración:</strong> {confirmation.durationMinutes} min</div>
          </div>
          <Link href={`/book/${slug}`} style={{ color: '#6366f1', textDecoration: 'none', fontSize: 14 }}>← Ver otros tipos de cita</Link>
        </div>
      </div>
    );
  }

  // Form screen
  if (step === 'form') {
    const extraQuestions = typeData?.extraQuestions || [];
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '32px 16px' }}>
        <Header />
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f4ff', borderRadius: 12, fontSize: 13.5, color: '#333' }}>
            <strong>{fmtDate(selectedSlot)}</strong> a las <strong>{fmtTime(selectedSlot)}</strong>
          </div>

          {formError && (
            <div style={{ color: '#dc2626', fontSize: 13, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, marginBottom: 14 }}>{formError}</div>
          )}

          <form onSubmit={handleBook}>
            {[
              { key: 'name',  label: 'Nombre completo',       type: 'text',  required: true,  placeholder: 'Juan García' },
              { key: 'phone', label: 'Teléfono (WhatsApp)',    type: 'tel',   required: true,  placeholder: '+5491112345678' },
              { key: 'email', label: 'Email (opcional)',       type: 'email', required: false, placeholder: 'juan@ejemplo.com' },
              { key: 'notes', label: 'Notas (opcional)',       type: 'textarea', required: false, placeholder: 'Comentarios adicionales...' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {f.label}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    rows={3}
                    style={inputStyle}
                  />
                ) : (
                  <input
                    type={f.type}
                    value={form[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    required={f.required}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}

            {extraQuestions.map(q => (
              <div key={q.id} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {q.label}{q.required && ' *'}
                </label>
                <input
                  type="text"
                  required={q.required}
                  value={form.answers[q.id] || ''}
                  onChange={e => setForm(prev => ({ ...prev, answers: { ...prev.answers, [q.id]: e.target.value } }))}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setStep('calendar')} style={secondaryBtnStyle}>Atrás</button>
              <button type="submit" disabled={booking} style={{ ...primaryBtnStyle, flex: 1 }}>
                {booking ? 'Reservando...' : 'Confirmar reserva'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Calendar / slots screen
  const today = toDateStr(new Date());
  const maxDate = typeData?.maxDaysInFuture
    ? toDateStr(new Date(Date.now() + typeData.maxDaysInFuture * 24 * 60 * 60 * 1000))
    : undefined;

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '32px 16px' }}>
      <Link href={`/book/${slug}`} style={{ fontSize: 13.5, color: '#6366f1', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>← Volver</Link>
      <Header />

      <div style={{ background: '#fff', borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {/* Date picker */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Seleccionar fecha
          </label>
          <input
            type="date"
            min={today}
            max={maxDate}
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          />
        </div>

        {/* Slots */}
        {selectedDate && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Horarios disponibles
            </label>
            {slotsLoading && <p style={{ color: '#888', fontSize: 13 }}>Cargando horarios...</p>}
            {!slotsLoading && slots.length === 0 && (
              <p style={{ color: '#888', fontSize: 13 }}>No hay horarios disponibles para este día.</p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                {slots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: '10px 8px',
                      border: selectedSlot === slot ? '2px solid #6366f1' : '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: selectedSlot === slot ? '#f0f0ff' : '#fff',
                      color: selectedSlot === slot ? '#6366f1' : '#111',
                      fontWeight: selectedSlot === slot ? 700 : 400,
                      cursor: 'pointer',
                      fontSize: 13.5,
                      transition: 'all 0.1s',
                    }}
                  >
                    {fmtTime(slot)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedSlot && (
          <button
            onClick={() => setStep('form')}
            style={{ ...primaryBtnStyle, width: '100%', marginTop: 20 }}
          >
            Continuar →
          </button>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', background: '#f9fafb',
  border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 13.5, color: '#111', fontFamily: 'inherit', outline: 'none',
};

const primaryBtnStyle = {
  padding: '12px 24px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff', border: 'none', borderRadius: 100, fontWeight: 700,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};

const secondaryBtnStyle = {
  padding: '12px 20px', background: 'none', border: '1px solid #e5e7eb',
  color: '#555', borderRadius: 100, fontWeight: 600,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};
