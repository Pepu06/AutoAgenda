'use client';

import styles from './AppointmentTable.module.css';

const STATUS_CONFIG = {
  pending:   { label: 'Pendiente',  color: 'var(--yellow)',  bg: 'var(--yellow-bg)' },
  notified:  { label: 'Notificado', color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  confirmed: { label: 'Confirmado', color: 'var(--green)',   bg: 'var(--green-bg)' },
  cancelled: { label: 'Cancelado',  color: 'var(--red)',     bg: 'var(--red-bg)' },
};

export default function AppointmentTable({ appointments, onStatusChange }) {
  if (appointments.length === 0) {
    return <p className={styles.empty}>No hay citas para mostrar.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Contacto</th>
            <th>Servicio</th>
            <th>Fecha y hora</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => {
            const s = STATUS_CONFIG[a.status] || { label: a.status, color: 'var(--gray)', bg: 'var(--gray-bg)' };
            return (
              <tr key={a.id}>
                <td>
                  <span className={styles.contactName}>{a.contact?.name}</span>
                  <span className={styles.contactPhone}>{a.contact?.phone}</span>
                </td>
                <td>{a.service?.name}</td>
                <td>
                  {new Date(a.scheduledAt).toLocaleString('es-AR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td>
                  <span
                    className={styles.badge}
                    style={{ background: s.bg, color: s.color }}
                  >
                    {s.label}
                  </span>
                </td>
                <td>
                  <select
                    value={a.status}
                    onChange={(e) => onStatusChange(a.id, e.target.value)}
                    className={styles.select}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="confirmed">Confirmado</option>
                    <option value="cancelled">Cancelado</option>
                    <option value="completed">Completado</option>
                    <option value="no_show">No asistió</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
