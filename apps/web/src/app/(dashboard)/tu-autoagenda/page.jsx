'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import styles from './tu-autoagenda.module.css';
import ScheduleModal from './components/ScheduleModal';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BOOKING_URL || 'https://autoagenda.online/book';

export default function TuAutoAgendaPage() {
  const router = useRouter();

  // Profile state
  const [profile, setProfile] = useState({
    slug: '', autoagendaTitle: '', autoagendaDescription: '', autoagendaProfileImage: null, autoagendaEnabled: false,
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving]   = useState(false);
  const [profileError, setProfileError]     = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Schedules state
  const [schedules, setSchedules]         = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [scheduleMenu, setScheduleMenu]   = useState(null); // id with open menu
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Types state
  const [types, setTypes]                 = useState([]);
  const [typesLoading, setTypesLoading]   = useState(true);
  const [typeMenu, setTypeMenu]           = useState(null);

  useEffect(() => {
    fetchProfile();
    fetchSchedules();
    fetchTypes();
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-menu]')) {
        setScheduleMenu(null);
        setTypeMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchProfile() {
    try {
      const res = await api.get('/autoagenda/profile');
      setProfile(res.data || {});
    } catch {
      // not configured yet — keep empty defaults
    } finally {
      setProfileLoading(false);
    }
  }

  async function fetchSchedules() {
    try {
      const res = await api.get('/autoagenda/schedules');
      setSchedules(res.data || []);
    } finally {
      setSchedulesLoading(false);
    }
  }

  async function fetchTypes() {
    try {
      const res = await api.get('/autoagenda/types');
      setTypes(res.data || []);
    } finally {
      setTypesLoading(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      await api.put('/autoagenda/profile', {
        slug: profile.slug,
        autoagendaTitle: profile.autoagendaTitle,
        autoagendaDescription: profile.autoagendaDescription,
        autoagendaEnabled: profile.autoagendaEnabled,
      });
    } catch (err) {
      setProfileError(err.message || 'Error al guardar.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.post('/autoagenda/profile/image', { dataUrl });
      setProfile(prev => ({ ...prev, autoagendaProfileImage: res.data?.imageUrl }));
    } catch (err) {
      setProfileError(err.message || 'Error al subir imagen.');
    } finally {
      setImageUploading(false);
    }
  }

  function getPublicUrl() {
    if (!profile.slug) return null;
    return `${PUBLIC_BASE}/${profile.slug}`;
  }

  function copyLink() {
    const url = getPublicUrl();
    if (url) navigator.clipboard.writeText(url);
  }

  // Schedules
  function openCreateSchedule() {
    setEditingSchedule(null);
    setShowScheduleModal(true);
  }

  function openEditSchedule(schedule) {
    setEditingSchedule(schedule);
    setShowScheduleModal(true);
    setScheduleMenu(null);
  }

  async function deleteSchedule(id) {
    if (!confirm('¿Eliminar este horario?')) return;
    try {
      await api.delete(`/autoagenda/schedules/${id}`);
      fetchSchedules();
    } catch (err) {
      alert(err.message || 'Error al eliminar.');
    }
    setScheduleMenu(null);
  }

  async function handleScheduleSaved() {
    setShowScheduleModal(false);
    await fetchSchedules();
  }

  // Types
  async function deleteType(id) {
    if (!confirm('¿Eliminar este tipo de cita?')) return;
    try {
      await api.delete(`/autoagenda/types/${id}`);
      fetchTypes();
    } catch (err) {
      alert(err.message || 'Error al eliminar.');
    }
    setTypeMenu(null);
  }

  const publicUrl = getPublicUrl();

  return (
    <div>
      <h1 className={styles.pageTitle}>TuAutoAgenda</h1>

      {/* SECTION: Profile */}
      <div className={styles.section} data-tour="publish-form">
        <h2 className={styles.sectionTitle}>Configuración</h2>
        <p className={styles.sectionSub}>
          Crea un sitio web que puedes compartir con tus clientes para que se agenden por sí mismos.
        </p>

        {/* Slug + actions row */}
        <div style={{ marginBottom: 20 }}>
          <label className={styles.label}>URL</label>
          <div className={styles.slugRow}>
            <span className={styles.slugPrefix}>autoagenda.online/book/</span>
            <input
              className={styles.slugInput}
              value={profile.slug || ''}
              onChange={e => setProfile(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="tu-negocio"
            />
          </div>
          <p className={styles.slugHint}>Este será el link que compartirás para que tus clientes agenden su cita.</p>
          {publicUrl && (
            <div className={styles.slugActions}>
              <a href={publicUrl} target="_blank" rel="noreferrer" className={styles.btnSecondary}>Abrir link ↗</a>
              <button className={styles.btnSecondary} onClick={copyLink}>Copiar link</button>
            </div>
          )}
        </div>

        {profileError && <div className={styles.error}>{profileError}</div>}

        <form onSubmit={saveProfile}>
          <div className={styles.field}>
            <label className={styles.label}>Título</label>
            <input
              className={styles.input}
              value={profile.autoagendaTitle || ''}
              onChange={e => setProfile(prev => ({ ...prev, autoagendaTitle: e.target.value }))}
              placeholder="ej: Pedro González Soro"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Descripción</label>
            <textarea
              className={styles.textarea}
              value={profile.autoagendaDescription || ''}
              onChange={e => setProfile(prev => ({ ...prev, autoagendaDescription: e.target.value }))}
              placeholder="Descripción de tu negocio."
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Imagen de perfil</label>
            <div className={styles.imageRow}>
              {profile.autoagendaProfileImage ? (
                <img src={profile.autoagendaProfileImage} alt="perfil" className={styles.imagePreview} />
              ) : (
                <div className={styles.imagePlaceholder}>+</div>
              )}
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{ display: 'none' }} />
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
              >
                {imageUploading ? 'Subiendo...' : 'Seleccionar imagen'}
              </button>
            </div>
          </div>

          <div className={styles.toggleRow}>
            <div>
              <div className={styles.toggleLabel}>Activar autoagenda</div>
              <div className={styles.toggleSub}>Cuando está activa, tus clientes pueden agendar desde tu link público.</div>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={!!profile.autoagendaEnabled}
                onChange={e => setProfile(prev => ({ ...prev, autoagendaEnabled: e.target.checked }))}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>

          <div className={styles.saveRow}>
            <button type="submit" className={styles.btnPrimary} disabled={profileSaving}>
              {profileSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION: Schedules */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Horarios</h2>
            <p className={styles.sectionSub} style={{ marginBottom: 0 }}>
              Crea tus horarios de trabajo. Si quieres bloquear fechas en un horario haz click en "Editar" y luego en "Modificar por fecha." Elige las fechas que quieras y márcalas como "No Disponible."
            </p>
          </div>
          <button className={styles.btnPrimary} onClick={openCreateSchedule} data-tour="schedule-btn">Crear Horario</button>
        </div>

        {schedulesLoading ? (
          <div className="spinnerWrap"><div className="spinner" /></div>
        ) : schedules.length === 0 ? (
          <p className={styles.empty}>No hay horarios aún.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr><th>Nombre</th><th></th></tr></thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className={styles.menuWrapper} data-menu>
                        <button className={styles.menuBtn} onClick={() => setScheduleMenu(scheduleMenu === s.id ? null : s.id)}>⋮</button>
                        {scheduleMenu === s.id && (
                          <div className={styles.menuDropdown}>
                            <button className={styles.menuItem} onClick={() => openEditSchedule(s)}>Editar</button>
                            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => deleteSchedule(s.id)}>Eliminar</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION: Types */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Tipos de cita que tus clientes pueden reservar</h2>
            <p className={styles.sectionSub} style={{ marginBottom: 0 }}>
              Define los servicios que aparecerán en tu autoagenda, cada uno con su duración y horario. Por ejemplo: "Cita de fisioterapía - 30 minutos".
            </p>
          </div>
          <button className={styles.btnPrimary} onClick={() => router.push('/tu-autoagenda/types/new')} data-tour="type-btn">Crear tipo de cita</button>
        </div>

        {typesLoading ? (
          <div className="spinnerWrap"><div className="spinner" /></div>
        ) : types.length === 0 ? (
          <p className={styles.empty}>No hay tipos de cita aún.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr><th>Nombre</th><th>Horario</th><th></th></tr></thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td>{t.title} · {t.durationMinutes} min</td>
                    <td>{t.schedule?.name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className={styles.menuWrapper} data-menu>
                        <button className={styles.menuBtn} onClick={() => setTypeMenu(typeMenu === t.id ? null : t.id)}>⋮</button>
                        {typeMenu === t.id && (
                          <div className={styles.menuDropdown}>
                            <button className={styles.menuItem} onClick={() => { router.push(`/tu-autoagenda/types/${t.id}`); setTypeMenu(null); }}>Editar</button>
                            <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => deleteType(t.id)}>Eliminar</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION: Preview */}
      {(profile.autoagendaTitle || types.length > 0) && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Así se ve tu sitio web:</h2>
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer" className={styles.btnSecondary}>Abrir link ↗</a>
            )}
          </div>
          <div className={styles.previewBox}>
            <div className={styles.previewHeader}>
              {profile.autoagendaProfileImage ? (
                <img src={profile.autoagendaProfileImage} alt="perfil" className={styles.previewAvatar} />
              ) : (
                <div className={styles.previewAvatarPlaceholder} />
              )}
              <div>
                <div className={styles.previewName}>{profile.autoagendaTitle || 'Tu negocio'}</div>
                <div className={styles.previewDesc}>{profile.autoagendaDescription || 'Descripción de tu negocio.'}</div>
              </div>
            </div>
            {types.length > 0 && (
              <div className={styles.previewBody}>
                <div className={styles.previewSection}>Reserva una cita con nosotros:</div>
                {types.map(t => (
                  <div key={t.id} className={styles.previewCard}>
                    <div>
                      <div className={styles.previewCardName}>{t.title}</div>
                      <div className={styles.previewCardSub}>{t.durationMinutes} min</div>
                    </div>
                    <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {showScheduleModal && (
        <ScheduleModal
          schedule={editingSchedule}
          onSaved={handleScheduleSaved}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
    </div>
  );
}
