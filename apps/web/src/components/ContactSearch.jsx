'use client';

import { useState, useEffect, useRef } from 'react';

export default function ContactSearch({ contacts, value, onChange, required }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = contacts.find(c => c.id === value);

  const filtered = query
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
      )
    : contacts;

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleFocus() {
    setQuery('');
    setOpen(true);
  }

  function handleInput(e) {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value) onChange('');
  }

  function handleSelect(c) {
    onChange(c.id);
    setQuery('');
    setOpen(false);
  }

  const displayValue = open ? query : (selected ? `${selected.name} — ${selected.phone}` : '');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={displayValue}
        onChange={handleInput}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)'; handleFocus(); }}
        placeholder="Buscar contacto..."
        required={required}
        autoComplete="off"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
        }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-3)' }}>
              Sin resultados
            </div>
          ) : filtered.map(c => (
            <div
              key={c.id}
              onMouseDown={() => handleSelect(c)}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                fontSize: 13.5,
                background: c.id === value ? 'var(--surface-2)' : undefined,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = c.id === value ? 'var(--surface-2)' : ''; }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{c.phone}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
