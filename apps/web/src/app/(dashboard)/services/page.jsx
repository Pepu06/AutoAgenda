'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import styles from '../contacts/contacts.module.css';

const EMPTY = { name: '', durationMinutes: 30, price: '' };

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [error, setError]       = useState('');

  async function fetchServices() {
    const res = await api.get('/services');
    setServices(res.data);
  }

  useEffect(() => {
    fetchServices().finally(() => setLoading(false));
  }, []);

  function startEdit(service) {
    setEditId(service.id);
    setForm({ name: service.name, durationMinutes: service.durationMinutes, price: service.price ?? '' });
    setShowForm(true);
  }

  function cancelForm() {
    setEditId(null);
    setForm(EMPTY);
    setShowForm(false);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        name:            form.name,
        durationMinutes: Number(form.durationMinutes),
        price:           form.price !== '' ? Number(form.price) : 0,
      };
      if (editId) {
        await api.put(`/services/${editId}`, payload);
      } else {
        await api.post('/services', payload);
      }
      cancelForm();
      fetchServices();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar servicio?')) return;
    await api.delete(`/services/${id}`);
    fetchServices();
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Servicios</h1>
        <button
          className={styles.btnPrimary}
          onClick={() => (showForm && !editId ? cancelForm() : setShowForm(true))}
        >
          {showForm && !editId ? 'Cancelar' : '+ Nuevo servicio'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>
            {editId ? 'Editar servicio' : 'Nuevo servicio'}
          </h3>
          <input
            placeholder="Nombre del servicio (ej: Consulta, Control)"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className={styles.input}
            required
          />
          <input
            placeholder="Duración (minutos)"
            type="number"
            min="5"
            value={form.durationMinutes}
            onChange={e => setForm({ ...form, durationMinutes: e.target.value })}
            className={styles.input}
            required
          />
          <input
            placeholder="Precio (opcional)"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
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
      ) : services.length === 0 ? (
        <p className={styles.empty}>No hay servicios aún.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Duración</th>
                <th>Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{s.price > 0 ? `$${Number(s.price).toLocaleString('es-AR')}` : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(s)} className={styles.btnPrimary}>Editar</button>
                    <button onClick={() => handleDelete(s.id)} className={styles.btnDelete}>Eliminar</button>
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
