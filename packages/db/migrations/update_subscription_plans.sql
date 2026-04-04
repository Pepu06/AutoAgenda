-- ============================================
-- Migration: Update Subscription Plans
-- Date: 2026-04-04
-- Description: Update SubscriptionPlan enum to reflect new pricing tiers
-- ============================================

-- 1. Rename old enum values to new ones
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'basic' TO 'inicial';
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'pro' TO 'profesional';

-- 2. Add new custom plan value
ALTER TYPE "SubscriptionPlan" ADD VALUE 'custom';

-- 3. Update existing subscriptions (if any basic/pro still exist)
-- This is a safety measure in case the renames didn't catch all records
UPDATE "Subscription" SET plan = 'inicial' WHERE plan = 'basic';
UPDATE "Subscription" SET plan = 'profesional' WHERE plan = 'pro';

-- ============================================
-- Verification queries
-- ============================================

-- Check updated plans
-- SELECT plan, COUNT(*) as count FROM "Subscription" GROUP BY plan;

-- View all subscription plans with their status
-- SELECT t.name, s.plan, s.status, s."currentPeriodEnd" 
-- FROM "Tenant" t 
-- LEFT JOIN "Subscription" s ON s."tenantId" = t.id;
