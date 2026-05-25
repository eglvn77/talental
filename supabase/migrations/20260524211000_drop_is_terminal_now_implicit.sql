-- "Terminal" is now implicit from category in (hired, rejected,
-- withdrawn). Dropping the column avoids letting two sources of truth
-- drift apart — analytics that used to filter `WHERE is_terminal`
-- should switch to `WHERE category IN ('hired','rejected','withdrawn')`.

ALTER TABLE hiring.process_template_stages DROP COLUMN IF EXISTS is_terminal;
ALTER TABLE hiring.pipeline_stages          DROP COLUMN IF EXISTS is_terminal;
