import { notFound } from 'next/navigation';
import Link from 'next/link';

async function getProfile(slug) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/public/book/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getProfile(slug);
  return { title: data?.profile?.title || 'TuAutoAgenda' };
}

export default async function BookProfilePage({ params }) {
  const { slug } = await params;
  const data = await getProfile(slug);
  if (!data) notFound();

  const { profile, types } = data;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>
      {/* Profile header */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {profile.profileImage ? (
            <img src={profile.profileImage} alt={profile.title} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', flexShrink: 0 }} />
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>{profile.title}</h1>
            {profile.description && <p style={{ margin: '4px 0 0', fontSize: 14, color: '#666' }}>{profile.description}</p>}
          </div>
        </div>
      </div>

      {/* Types */}
      {types.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 16px', fontWeight: 700, fontSize: 15, color: '#111' }}>Reserva una cita con nosotros:</p>
          {types.map(t => (
            <Link
              key={t.id}
              href={`/book/${slug}/${t.id}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: 12,
                marginBottom: 10, textDecoration: 'none', color: 'inherit',
                transition: 'border-color 0.15s',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>{t.durationMinutes} min</div>
              </div>
              <span style={{ color: '#aaa', fontSize: 20 }}>›</span>
            </Link>
          ))}
        </div>
      )}

      {types.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay tipos de cita disponibles.</div>
      )}
    </div>
  );
}
