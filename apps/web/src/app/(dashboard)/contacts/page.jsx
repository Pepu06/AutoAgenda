'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from './contacts.module.css';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [error, setError] = useState('');

  async function fetchContacts() {
    const res = await api.get('/contacts');
    setContacts(res.data);
  }

  useEffect(() => {
    fetchContacts().finally(() => setLoading(false));
  }, []);

  function startEdit(contact) {
    setEditId(contact.id);
    setForm({ name: contact.name, phone: contact.phone, email: contact.email || '', notes: contact.notes || '' });
    setShowForm(true);
  }

  function cancelForm() {
    setEditId(null);
    setForm({ name: '', phone: '', email: '', notes: '' });
    setShowForm(false);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await api.put(`/contacts/${editId}`, form);
      } else {
        await api.post('/contacts', form);
      }
      cancelForm();
      fetchContacts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar contacto?')) return;
    await api.delete(`/contacts/${id}`);
    fetchContacts();
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Contactos</h1>
        <button
          className={styles.btnPrimary}
          onClick={() => (showForm && !editId ? cancelForm() : setShowForm(true))}
        >
          {showForm && !editId ? 'Cancelar' : '+ Nuevo contacto'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>
            {editId ? 'Editar contacto' : 'Nuevo contacto'}
          </h3>
          <input
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={styles.input}
            required
          />
          <input
            placeholder="Teléfono (ej: +5491112345678)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={styles.input}
            required
          />
          <input
            placeholder="Email (opcional, para invitar como participante en Calendar)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={styles.input}
            type="email"
          />
          <input
            placeholder="Notas (opcional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className={styles.btnPrimary}>
              {editId ? 'Actualizar' : 'Guardar'}
            </button>
            <button type="button" onClick={cancelForm} className={styles.btnDelete}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="spinnerWrap"><div className="spinner" /></div>
      ) : contacts.length === 0 ? (
        <p className={styles.empty}>No hay contactos aún.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.notes || '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(c)} className={styles.btnPrimary}>
                      Editar
                    </button>
                    <button onClick={() => handleDelete(c.id)} className={styles.btnDelete}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
