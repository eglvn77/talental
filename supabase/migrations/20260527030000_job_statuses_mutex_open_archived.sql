-- is_open and is_archived describe contradictory lifecycle states:
-- is_open = actively recruiting (public on /careers); is_archived =
-- closed (template propagation skips). A row can be neither (a
-- transitional state like Borrador) but not both. A CHECK keeps the
-- impossible state out of the table regardless of UI bugs.
ALTER TABLE hiring.job_statuses
  ADD CONSTRAINT job_statuses_open_archived_mutex
  CHECK (NOT (is_open AND is_archived));
