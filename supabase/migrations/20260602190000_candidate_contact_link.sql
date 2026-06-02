-- Bidirectional link between a candidate row and a contact row when
-- they represent the same person across a role conversion. "Active"
-- side is the one with linked_*_id IS NULL. List views filter to
-- active rows so a converted candidate stops appearing in /candidates
-- and shows up in /contacts instead. Mutual exclusivity by email +
-- linkedin_url is enforced via partial unique indexes per workspace
-- (and cross-table at the action layer, since PG doesn't support
-- cross-table UNIQUE natively).

alter table hiring.candidates
  add column if not exists linked_contact_id uuid
    references hiring.contacts(id) on delete set null;

alter table hiring.contacts
  add column if not exists linked_candidate_id uuid
    references hiring.candidates(id) on delete set null;

create index if not exists candidates_linked_contact_id_idx
  on hiring.candidates(linked_contact_id);
create index if not exists contacts_linked_candidate_id_idx
  on hiring.contacts(linked_candidate_id);

create unique index if not exists candidates_active_email_uq
  on hiring.candidates(workspace_id, lower(email))
  where linked_contact_id is null and email is not null and email <> '';

create unique index if not exists contacts_active_email_uq
  on hiring.contacts(workspace_id, lower(email))
  where linked_candidate_id is null and email is not null and email <> '';

create unique index if not exists candidates_active_linkedin_uq
  on hiring.candidates(workspace_id, linkedin_url)
  where linked_contact_id is null and linkedin_url is not null and linkedin_url <> '';

create unique index if not exists contacts_active_linkedin_uq
  on hiring.contacts(workspace_id, linkedin_url)
  where linked_candidate_id is null and linkedin_url is not null and linkedin_url <> '';
