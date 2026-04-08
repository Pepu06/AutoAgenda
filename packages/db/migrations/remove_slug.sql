-- Remove unused slug column from tenants table
-- The slug field was not being used for any routing or lookups

ALTER TABLE tenants DROP COLUMN IF EXISTS slug;
