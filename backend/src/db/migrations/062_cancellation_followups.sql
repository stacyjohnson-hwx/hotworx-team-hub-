-- Cancellations get a running list of follow-up TASKS (like missed guests), not
-- just a single next-follow-up date. Each task has its own due date + note + done
-- flag; cancellation_log.follow_up_date is kept in sync to the earliest open task
-- so the win-back queue and scheduler keep working unchanged.
CREATE TABLE IF NOT EXISTS cancellation_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  cancellation_id uuid NOT NULL REFERENCES cancellation_log(id) ON DELETE CASCADE,
  due_date date,
  note text,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cxl_followups_cxl ON cancellation_followups(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_cxl_followups_studio ON cancellation_followups(studio_id);
