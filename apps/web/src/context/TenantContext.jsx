'use client';

import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { api } from '../lib/api';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [currentTenantId, setCurrentTenantId] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUserTenants = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/subscription/user-tenants');
      setTenants(data || []);

      const savedId = typeof window !== 'undefined' ? localStorage.getItem('currentTenantId') : null;
      const match = data?.find(t => t.tenant_id === savedId) || data?.[0];
      if (match) {
        setCurrentTenantId(match.tenant_id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentTenantId', match.tenant_id);
        }
      }
    } catch {
      // Non-critical — single-tenant users may not have user_tenants rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserTenants();
  }, [fetchUserTenants]);

  const switchTenant = useCallback((tenantId) => {
    const found = tenants.find(t => t.tenant_id === tenantId);
    if (!found) return;
    setCurrentTenantId(tenantId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentTenantId', tenantId);
    }
  }, [tenants]);

  const currentTenant = tenants.find(t => t.tenant_id === currentTenantId)?.tenants || null;

  return (
    <TenantContext.Provider value={{ currentTenant, currentTenantId, tenants, loading, switchTenant, refetchTenants: fetchUserTenants }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider');
  return ctx;
}
