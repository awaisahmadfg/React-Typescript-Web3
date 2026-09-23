ALTER TABLE plans
ADD COLUMN IF NOT EXISTS task_schedule_start_date date DEFAULT CURRENT_DATE;

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS email_task_count integer DEFAULT 4;

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS linkedin_task_count integer DEFAULT 4;

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS call_task_count integer DEFAULT 4;

UPDATE plans
SET
  task_schedule_start_date = COALESCE(task_schedule_start_date, CURRENT_DATE),
  email_task_count = COALESCE(email_task_count, 4),
  linkedin_task_count = COALESCE(linkedin_task_count, 4),
  call_task_count = COALESCE(call_task_count, 4);

ALTER TABLE plans
ALTER COLUMN task_schedule_start_date SET NOT NULL;

ALTER TABLE plans
ALTER COLUMN email_task_count SET NOT NULL;

ALTER TABLE plans
ALTER COLUMN linkedin_task_count SET NOT NULL;

ALTER TABLE plans
ALTER COLUMN call_task_count SET NOT NULL;
