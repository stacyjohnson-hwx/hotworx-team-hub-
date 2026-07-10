-- Last completion per cleaning task, without a row cap.
--
-- GET /api/cleaning/today previously pulled the most-recent 2000 completions and
-- found each task's latest in JS. Supabase caps a select at 1000 rows, and a busy
-- studio logs dozens of completions a day, so any weekly/occasional task last done
-- outside the ~1000-row window wrongly showed "Never completed". This view returns
-- exactly one row per task (its latest completion), so the lookup is correct and cheap.
CREATE OR REPLACE VIEW cleaning_last_completion AS
SELECT DISTINCT ON (task_id)
  studio_id, task_id, completion_date, completed_by, completed_at
FROM cleaning_completions
ORDER BY task_id, completed_at DESC;

-- Backend reads this via the service role; keep it off the public Data API.
REVOKE ALL ON cleaning_last_completion FROM anon, authenticated;
