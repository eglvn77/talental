-- Whether to publish the company name on the public careers page.
-- Default true to match current behaviour. Recruiting agencies can
-- turn it off when the client wants the role to stay anonymous
-- until later in the funnel.
ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS show_company_in_posting boolean NOT NULL DEFAULT true;
