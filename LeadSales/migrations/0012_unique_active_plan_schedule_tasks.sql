-- Remove duplicate active generated plan tasks, keep most recent row per (plan_id, schedule_key).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY plan_id, schedule_key
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM tasks
  WHERE plan_id IS NOT NULL
    AND schedule_key IS NOT NULL
    AND status IN ('OPEN', 'PENDING', 'IN_PROGRESS')
)
DELETE FROM tasks t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- Prevent duplicate active generated tasks for the same plan schedule slot.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_unique_active_plan_schedule_key_idx
ON tasks (plan_id, schedule_key)
WHERE plan_id IS NOT NULL
  AND schedule_key IS NOT NULL
  AND status IN ('OPEN', 'PENDING', 'IN_PROGRESS');
