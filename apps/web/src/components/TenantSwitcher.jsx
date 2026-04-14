'use client';

import { useTenant } from '../context/TenantContext';

export function TenantSwitcher() {
  const { currentTenantId, tenants, switchTenant, loading } = useTenant();

  // Only render if user has multiple tenants
  if (loading || tenants.length <= 1) return null;

  return (
    <select
      value={currentTenantId || ''}
      onChange={e => switchTenant(e.target.value)}
      style={{
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--border, #e5e7eb)',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        background: 'var(--surface, #fff)',
        color: 'var(--text, #111)',
        maxWidth: '180px',
      }}
      aria-label="Cambiar negocio"
    >
      {tenants.map(t => (
        <option key={t.tenant_id} value={t.tenant_id}>
          {t.tenants?.business_name || t.tenants?.name || t.tenant_id}
          {t.tenants?.subscriptions?.[0]?.plan && t.tenants.subscriptions[0].plan !== 'trial' ? ' ★' : ''}
        </option>
      ))}
    </select>
  );
}
