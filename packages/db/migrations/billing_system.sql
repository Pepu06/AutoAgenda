-- ============================================
-- Migration: Add Billing System
-- Date: 2026-04-04
-- Description: Add subscription management, usage tracking, and trial system
-- ============================================

-- 1. Create new enums
CREATE TYPE "SubscriptionPlan" AS ENUM ('trial', 'basic', 'pro');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due', 'trial_expired');

-- 2. Add new columns to Tenant table
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "messagesSentThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Tenant" ADD COLUMN "subscriptionId" TEXT;

-- 3. Set trialEndsAt for existing tenants (15 days from their creation date)
UPDATE "Tenant" SET "trialEndsAt" = "createdAt" + INTERVAL '15 days' WHERE "trialEndsAt" IS NULL;

-- 4. Create Subscription table
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'trial',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "mpSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- 5. Create UsageRecord table
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "appointmentsCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- 6. Create unique indexes
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE UNIQUE INDEX "Subscription_mpSubscriptionId_key" ON "Subscription"("mpSubscriptionId");
CREATE UNIQUE INDEX "UsageRecord_tenantId_year_month_key" ON "UsageRecord"("tenantId", "year", "month");

-- 7. Create regular indexes for performance
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");
CREATE INDEX "Subscription_mpSubscriptionId_idx" ON "Subscription"("mpSubscriptionId");
CREATE INDEX "UsageRecord_tenantId_idx" ON "UsageRecord"("tenantId");

-- 8. Add foreign key constraints
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" 
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" 
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Create initial subscription records for existing tenants
INSERT INTO "Subscription" ("id", "tenantId", "plan", "status", "createdAt", "updatedAt")
SELECT 
    'sub_' || "id", 
    "id", 
    'trial', 
    CASE 
        WHEN "trialEndsAt" > NOW() THEN 'active'::SubscriptionStatus
        ELSE 'trial_expired'::SubscriptionStatus
    END,
    NOW(),
    NOW()
FROM "Tenant"
WHERE NOT EXISTS (
    SELECT 1 FROM "Subscription" WHERE "Subscription"."tenantId" = "Tenant"."id"
);

-- 10. Update subscriptionId in Tenant table
UPDATE "Tenant" SET "subscriptionId" = (
    SELECT "id" FROM "Subscription" WHERE "Subscription"."tenantId" = "Tenant"."id" LIMIT 1
)
WHERE "subscriptionId" IS NULL;

-- ============================================
-- Verification queries (run these to verify)
-- ============================================

-- Check new columns in Tenant
-- SELECT id, name, "trialEndsAt", "messagesSentThisMonth", "subscriptionId" FROM "Tenant" LIMIT 5;

-- Check Subscription records
-- SELECT * FROM "Subscription" LIMIT 5;

-- Check UsageRecord table structure
-- SELECT * FROM "UsageRecord" LIMIT 1;

-- Verify trial status for all tenants
-- SELECT t.name, t."trialEndsAt", s.plan, s.status 
-- FROM "Tenant" t 
-- LEFT JOIN "Subscription" s ON s."tenantId" = t.id;
