-- Replace hiring.pipeline_category with the canonical set the product
-- now standardizes on. Drives consistent funnel analytics across
-- workspaces — every stage card is named freely but pinned to one of
-- these 14 categories so "Entrevista 1" / "Entrevista 2" / etc. all
-- roll up to client_interview.
--
-- Mapping of old -> new for existing rows:
--   applied    -> applicants
--   answered   -> conversation
--   screening  -> screen
--   interview  -> client_interview
-- Everything else (sourced/contacted/submitted/offer/hired/rejected/
-- withdrawn) keeps its name.
--
-- Three columns ride on this enum:
--   hiring.pipeline_stages.category
--   hiring.applications.category
--   hiring.process_template_stages.category

CREATE TYPE hiring.pipeline_category_v2 AS ENUM (
  'sourced',
  'applicants',
  'shortlisted',
  'contacted',
  'conversation',
  'screen',
  'submitted',
  'client_interview',
  'assessment',
  'background_check',
  'offer',
  'hired',
  'rejected',
  'withdrawn'
);

ALTER TABLE hiring.pipeline_stages
  ALTER COLUMN category TYPE hiring.pipeline_category_v2
  USING (
    CASE category::text
      WHEN 'applied'    THEN 'applicants'
      WHEN 'answered'   THEN 'conversation'
      WHEN 'screening'  THEN 'screen'
      WHEN 'interview'  THEN 'client_interview'
      ELSE category::text
    END
  )::hiring.pipeline_category_v2;

ALTER TABLE hiring.applications
  ALTER COLUMN category TYPE hiring.pipeline_category_v2
  USING (
    CASE category::text
      WHEN 'applied'    THEN 'applicants'
      WHEN 'answered'   THEN 'conversation'
      WHEN 'screening'  THEN 'screen'
      WHEN 'interview'  THEN 'client_interview'
      ELSE category::text
    END
  )::hiring.pipeline_category_v2;

ALTER TABLE hiring.process_template_stages
  ALTER COLUMN category TYPE hiring.pipeline_category_v2
  USING (
    CASE category::text
      WHEN 'applied'    THEN 'applicants'
      WHEN 'answered'   THEN 'conversation'
      WHEN 'screening'  THEN 'screen'
      WHEN 'interview'  THEN 'client_interview'
      ELSE category::text
    END
  )::hiring.pipeline_category_v2;

DROP TYPE hiring.pipeline_category;
ALTER TYPE hiring.pipeline_category_v2 RENAME TO pipeline_category;
