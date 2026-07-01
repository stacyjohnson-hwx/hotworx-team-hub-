-- Let the SAIL cancelled export auto-populate the Cancellations tab. `source`
-- marks where a row came from; `import_key` (studio + SAIL customer_id + date)
-- dedupes so re-importing the same cancelled file never creates duplicates.
alter table cancellation_log add column if not exists source text default 'manual';
alter table cancellation_log add column if not exists import_key text;
-- Non-partial so ON CONFLICT can infer it; NULL import_keys (manual rows) stay distinct.
create unique index if not exists uq_cancellation_import_key
  on cancellation_log(studio_id, import_key);
