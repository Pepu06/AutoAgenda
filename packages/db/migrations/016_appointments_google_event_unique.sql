-- Duplicate WhatsApp confirmations: two calendar syncs can run at the same time
-- (the Google push webhook and the background sync fired by every GET /calendar/events).
-- Both see the same Google event as "not yet synced" and both insert an appointment,
-- so the same turno gets two rows and two confirmation messages. The per-row atomic
-- claim in sendConfirmation cannot help — the rows are different.
-- This constraint is the serializer: the loser of the race gets ON CONFLICT DO NOTHING.
--
-- NULL google_event_id rows (manual appointments) are unaffected: Postgres treats
-- NULLs as distinct in unique constraints.

-- 1) Check for pre-existing duplicates — the ALTER below fails if any exist:
--    SELECT tenant_id, google_event_id, count(*), array_agg(id ORDER BY created_at)
--    FROM appointments
--    WHERE google_event_id IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
--    Review them and delete the newer row of each pair by id (check message_logs
--    references first). Do NOT bulk-delete blindly.

-- 2) Apply the constraint:
ALTER TABLE appointments
  ADD CONSTRAINT appointments_tenant_google_event_uniq UNIQUE (tenant_id, google_event_id);
