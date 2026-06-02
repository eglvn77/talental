-- Candidate profile: optional secondary email/phone + structured compensation.
-- Secondary contacts are optional (shown in UI only when present); primary
-- stays in candidates.email / candidates.phone. Compensation is current +
-- expected, each with its own ISO currency code (default MXN in the UI).

alter table hiring.candidates
  add column if not exists email_secondary text,
  add column if not exists phone_secondary text,
  add column if not exists comp_current_amount numeric,
  add column if not exists comp_current_currency text,
  add column if not exists comp_expected_amount numeric,
  add column if not exists comp_expected_currency text;

comment on column hiring.candidates.email_secondary is 'Optional secondary email; primary lives in email.';
comment on column hiring.candidates.phone_secondary is 'Optional secondary phone; primary lives in phone.';
comment on column hiring.candidates.comp_current_amount is 'Current compensation amount (gross), currency in comp_current_currency.';
comment on column hiring.candidates.comp_expected_amount is 'Expected compensation amount (gross), currency in comp_expected_currency.';
