-- Tabla para almacenar comprobantes de pago
CREATE TABLE IF NOT EXISTS "PaymentProof" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL, -- 'inicial', 'profesional', 'custom'
  amount DECIMAL(10, 2) NOT NULL,
  image_url TEXT NOT NULL, -- URL del comprobante en Supabase Storage
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  notes TEXT, -- Notas del admin (motivo de rechazo, etc)
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_tenant ON "PaymentProof"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON "PaymentProof"(status);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_created ON "PaymentProof"(created_at DESC);
