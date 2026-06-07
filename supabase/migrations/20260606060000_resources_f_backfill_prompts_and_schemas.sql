-- =====================================================
-- Phase 4a-i: Backfill `generator_prompt` and `schema_json` on the
-- 7 system resource definitions and update the workspace seed
-- trigger so new workspaces start with the same defaults.
--
-- Source of truth for the seed payload lives in code:
--   lib/kickoff/default-sections.ts (prompts)
--   lib/kickoff/default-schemas.ts (schemas)
-- and this migration mirrors them inline so a fresh database can
-- bootstrap without running the app. When we update a default we
-- ship a follow-up migration that touches both code + DB.
--
-- We touch ONLY rows where the existing column is empty/`{}` —
-- never overwrite a workspace's local edits.
-- =====================================================

-- 1. Seed-source functions. Each returns the default for one key.
--    Kept as separate functions for readability and so individual
--    defaults can be tweaked via CREATE OR REPLACE in later
--    migrations without rewriting one giant function.

CREATE OR REPLACE FUNCTION hiring.default_section_prompt(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_key
    WHEN 'requirements' THEN
$$Two arrays of plain-text strings:
- must: non-negotiables, sorted most-to-least critical. Specific. "B2C experience" is a requirement. "Strong communicator" is not.
- nice: nice-to-haves, specific tools, niche experience, sorted by relevance.$$
    WHEN 'sourcing' THEN
$$Only when role_type != inbound_ai_driven.

Always in English regardless of other language settings.

- criteria: array of mandatory requirements verifiable from a LinkedIn profile in under 30 seconds. Hard filters during sourcing. Example: "5+ years in B2C growth marketing," "Based in São Paulo or willing to relocate."
- questions: array of optional/preferential requirements written as questions. Used to evaluate and rate candidates, not filter. Example: "Does the profile show evidence of data-driven work alongside brand?"
- target_companies: plain array of company names. Mix companies known to be strong in this function with companies in the client's industry (direct or adjacent competitors). If the client named target companies, those go first. Exclude any the client named to avoid. No descriptions.$$
    WHEN 'hiring_process' THEN
$$Renders as the "Interview Process" tab in the package.

Array of interview stages in order. Each stage: { order (1-indexed), who (role title only — no personal names), focus (what is evaluated at this stage), format (optional: phone/video/in-person/case) }.

For Inbound AI Driven, list AI stages first (Application Questions, AI Interview) before human stages.

ALWAYS generate at least the standard stages even when the client hasn't specified the full process — typical baseline: Talental screen → Hiring Manager video → Final loop / references. Recruiter will edit before sending to the client. Never leave this section null.$$
    WHEN 'application_questions' THEN
$$Only when role_type != full_headhunting.

Language follows ai_process_language.

Each question is a written form item used for screening and auto-rejection on eliminatory criteria.

Question design:
- Default to binary (Yes/No) questions whenever possible.
- Reframe open-ended questions as binary thresholds. "Is Chapalita less than 1 hour from where you live?" beats "How far do you live from Chapalita?"
- Use open-ended only when truly necessary (salary expectation without a client-defined range).
- Each question 1-2 sentences. Conversational, not bureaucratic.

For each question:
- question: the form question text
- requirement: what the question evaluates, as a clear pass/fail rule using actual intake values
- type: "eliminatory" or "preferential"
- auto_reject_rule: only for eliminatory questions. The exact answer that triggers auto-rejection (e.g. "Auto-reject if answer is No"). Use null otherwise.

Cover only screening topics: location, compensation, availability, language, visa/contract, binary eliminatory experience requirements. Nuanced evaluation goes to ai_interview_questions.$$
    WHEN 'ai_interview_questions' THEN
$$Only when role_type != full_headhunting.

Language follows ai_process_language.

Structured voice interview by AI. The AI automatically asks two opening questions: "Tell me about your current role" and "Can you share one or two achievements you feel proud of there?" Do not duplicate these.

Order categories from general to specific. Group related criteria into categories.

**No duplication rule**

Each requirement is evaluated in exactly ONE stage. Never duplicate between application_questions and ai_interview_questions.
- Hard pass/fail (years, location, language, comp, contract) → application_questions only.
- Nuanced evaluation (depth, judgment, storytelling) → ai_interview_questions only.

**Question design**

The first question must extract enough signal in a single answer for the AI to score against Strong/Weak criteria. Probing follow-ups exist for the cases where the candidate's first answer is too vague, too short, or skips the action/outcome — they are NOT used by default.

1. **Open-ended only.** No yes/no, no multiple choice, no leading. The candidate must do the thinking.
2. **No hints.** The question must NEVER contain the trait being evaluated. Test: read the question. Could you guess Strong criteria from the question alone? If yes, rewrite.

How to write each question:
- Ask for a specific example or situation, not opinions or self-assessment.
- Stack the question to elicit situation + actions + outcome in one shot.
- Ask for numbers, names, and timeframes when relevant.
- Avoid telegraphing words: "successful," "innovative," "data-driven," "strategic," "challenging."

For each criterion, output:
- name: criterion name
- question: 1-2 sentences, open-ended, no hints
- strong: under 255 characters — the *rubric* (concrete signals that indicate a strong answer)
- weak: under 255 characters — the *rubric* (concrete signals that indicate a weak answer)
- strong_example_answer: 1-2 sentences in the candidate's voice — what a strong answer actually *sounds like*. Concrete, specific, with numbers/names where applicable. NOT a paraphrase of the rubric.
- weak_example_answer: 1-2 sentences in the candidate's voice — what a weak/thin answer sounds like (vague, opinion-only, no specifics, defaults to "I think…" or "we usually…").
- probing_questions: 1–3 short follow-ups the interviewer can deploy when the candidate's first answer is too vague to score. Each probe asks for one missing dimension (e.g. "What was the outcome?", "How did you measure it?", "What did you actually do, step by step?"). Do not telegraph the trait being evaluated.
- rationale: optional, one sentence on why this matters

Examples vs rubrics — quick test: a rubric describes *what the scorer is looking for*; an example shows *what the candidate would say*. The two must agree, not duplicate each other.

Maximum 10 criteria total across all categories. All are preferential — eliminatory filtering happens at the application stage.$$
    WHEN 'talental_interview_script' THEN
$$Markdown. Content varies by role_type.

For Full Headhunting:
- Fields header: Location / Job Situation / Next Steps / Interest / Current Comp / Desired Comp / Optional (Language, Contract, Office, Schedule, Availability)
- *Tell me about your current role*
- *Can you share one or two achievements you feel proud of there?*
- Role-specific probing areas (short bold label + 2-3 sub-bullets describing what good looks like, focused on most important requirements)
- *When we speak to your previous managers, how would they rate your performance on a scale of 1 to 10?*
- *Only for strong candidates: Who are the best professionals you know?*
- INTERVIEW PROCESS / ROLE PITCH / TEAM STRUCTURE / SALARY RANGE blocks

For Inbound AI Driven: only the inbound variant (skip fields already captured; focus on motivation + AI Report Review).

Use markdown headings (##, ###) and bold for sub-headers. No <details> tags.$$
    WHEN 'outreach_sequence' THEN
$$Only when role_type != inbound_ai_driven.

5 messages. Each adds new value. Never repeats. No email signatures, no booking links, no JD links.

Step / channel / delay_hours layout:

1. step=1, channel=email, delay_hours=0 — subject 3-9 words. Body voice samples (Emanuel's real outreach — match this exact register):
   • ES: "Hola [Nombre], / Te escribo porque estoy buscando [Rol] para [Empresa] y tu puesto en [Empresa Actual] me hizo mucho match. / [paragraph about what makes the company / role different — 1-2 sentences] / Estamos buscando quien lleve el ownership completo de [...]: [scope list — brand strategy / canales orgánicos / etc.] / [team size or 'chaos hint' — 1 sentence] / Te interesa?"
   • EN: "Hi [Name], / I'm reaching out because I'm hiring a [Role] at [Company] and your work at [Current Co] caught my eye. / [1-2 sentences on what's different about the role/co] / We're looking for someone who'll own [scope list]. / [team / stage / opportunity — 1 sentence] / Open to a quick conversation?"
   Structure: 4-6 SHORT paragraphs separated by blank lines. No bullets in step 1 — only short sentences. No signature. Casual but professional Spanish/English (use "Te interesa?" not "¿Te interesaría conocer más?"). 50-80 words total.

2. step=2, channel=email, delay_hours=24 — ONE SHORT LINE. This is the entire literal body, no preamble, no new angle, no opt-out, no signature:
   • ES: "[Nombre], viste mi mensaje anterior?"
   • EN: "[Name], did you see my previous message?"
   Subject = Message 1's subject. The message is purely a check-in to surface the original; do NOT pitch again or add new context. Anything beyond the single question is wrong.

3. step=3, channel=linkedin_invitation, delay_hours=24 — BLANK connection request. body MUST be the empty string "" and subject MUST be the empty string "". Do not write any text — LinkedIn invitations are sent without a note. This is non-negotiable: any non-empty body or subject here is a bug.
4. step=4, channel=linkedin_inmail, delay_hours=24 — 2-3 sentences. Reference prior email outreach. Restate the role in one line. Subject = Message 1's subject.
5. step=5, channel=email, delay_hours=72 — 3-5 sentences. Soft urgency, no fabrication. Referral ask. Door open with warm close.

CRITICAL — write FOR the candidate, not ABOUT the company:
- ✅ "El producto ya tiene tracción, lo que falta es quien convierta. Tú escribes el playbook de cierre."
- ❌ "SaaS B2B con producto vivo, clientes pagando y partnership recién firmado con Geotab."

Use company facts only when they translate into something the candidate cares about (who they'll work with, stage of chaos/structure, ownership).

Reply-rate killers: two CTAs in one message, bullet points in Message 1, leading with salary or company name, generic openers, stacked company facts, Spanglish, fabricating pipeline status.

Style:
- Short sentences. Active verbs. Future tense for the candidate.
- Whitespace matters — break Message 1 into 2-4 short paragraphs.
- Candidate is the subject of at least half the sentences.$$
    ELSE ''
  END;
$fn$;

CREATE OR REPLACE FUNCTION hiring.default_section_schema(p_key text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_key
    WHEN 'requirements' THEN $${"type":"object","additionalProperties":false,"required":["must","nice"],"properties":{"must":{"type":"array","items":{"type":"string"}},"nice":{"type":"array","items":{"type":"string"}}}}$$::jsonb
    WHEN 'sourcing' THEN $${"type":["object","null"],"additionalProperties":false,"description":"Sourcing Guidelines — only for Full Headhunting and Hybrid AI + Hunting. Set to null otherwise. Always in English.","properties":{"criteria":{"type":"array","items":{"type":"string"}},"questions":{"type":"array","items":{"type":"string"}},"target_companies":{"type":"array","items":{"type":"string"}}},"required":["criteria","questions","target_companies"]}$$::jsonb
    WHEN 'hiring_process' THEN $${"type":"array","items":{"type":"object","additionalProperties":false,"required":["order","who","focus"],"properties":{"order":{"type":"integer"},"who":{"type":"string"},"focus":{"type":"string"},"format":{"type":["string","null"]}}}}$$::jsonb
    WHEN 'application_questions' THEN $${"type":["array","null"],"description":"Tally form questions. Only for Hybrid AI + Hunting and Inbound AI Driven. Null otherwise.","items":{"type":"object","additionalProperties":false,"required":["question","requirement","type"],"properties":{"question":{"type":"string"},"requirement":{"type":"string"},"type":{"type":"string","enum":["eliminatory","preferential"]},"auto_reject_rule":{"type":["string","null"]}}}}$$::jsonb
    WHEN 'ai_interview_questions' THEN $${"type":["array","null"],"description":"Categories with criteria. Only for Hybrid AI + Hunting and Inbound AI Driven. Null otherwise. Maximum 10 criteria total across all categories.","items":{"type":"object","additionalProperties":false,"required":["category","criteria"],"properties":{"category":{"type":"string"},"description":{"type":"string"},"criteria":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","question","strong","weak"],"properties":{"name":{"type":"string"},"question":{"type":"string"},"strong":{"type":"string","description":"Rubric for a strong answer (criteria/signals). Max 255 characters."},"weak":{"type":"string","description":"Rubric for a weak answer (criteria/signals). Max 255 characters."},"rationale":{"type":"string"},"strong_example_answer":{"type":"string","description":"Optional. 1–2 sentences showing what a strong answer sounds like in the candidate's voice. Anchors the rubric in concrete language."},"weak_example_answer":{"type":"string","description":"Optional. 1–2 sentences showing a weak/thin answer."},"probing_questions":{"type":"array","description":"Optional. 1–3 follow-up questions to ask when the candidate's first answer is too vague to score against the rubric.","items":{"type":"string"}}}}}}}}$$::jsonb
    WHEN 'talental_interview_script' THEN $${"type":"string","description":"Markdown — Talental Interview script for this role_type per the master prompt's spec. Includes the variant(s) that apply."}$$::jsonb
    WHEN 'outreach_sequence' THEN $${"type":["array","null"],"description":"5-message outreach sequence — only for Full Headhunting and Hybrid AI + Hunting. Null otherwise.","items":{"type":"object","additionalProperties":false,"required":["step","channel","delay_hours","body"],"properties":{"step":{"type":"integer"},"channel":{"type":"string","enum":["email","linkedin_invitation","linkedin_inmail","linkedin_message"]},"delay_hours":{"type":"integer"},"subject":{"type":"string"},"body":{"type":"string"}}}}$$::jsonb
    ELSE '{}'::jsonb
  END;
$fn$;

-- 2. Backfill the 7 existing system rows. Only touch rows whose
--    columns are still the empty defaults — never clobber a
--    workspace edit.
UPDATE hiring.resource_definitions
SET
  generator_prompt = hiring.default_section_prompt(key),
  schema_json = hiring.default_section_schema(key)
WHERE is_system = true
  AND key IN (
    'requirements','sourcing','hiring_process','application_questions',
    'ai_interview_questions','talental_interview_script','outreach_sequence'
  )
  AND (
    generator_prompt = '' OR generator_prompt IS NULL OR
    schema_json = '{}'::jsonb OR schema_json IS NULL
  );

-- 3. Update the seed trigger so new workspaces get the populated
--    defaults out of the box. Replaces the previous seed; SOP +
--    the 7 paquete rows + the new defaults all flow through here.
CREATE OR REPLACE FUNCTION hiring.tg_workspaces_seed_resource_definitions()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  INSERT INTO hiring.resource_definitions
    (workspace_id, key, label, kind, position, is_system, is_enabled,
     schema_json, generator_prompt, template_json)
  VALUES
    (NEW.id, 'sop', 'SOP', 'checklist', 0, true, true,
     '{}'::jsonb, '', hiring.sop_default_template_json()),
    (NEW.id, 'requirements', 'Requirements', 'structured', 1,
       true, true,
       hiring.default_section_schema('requirements'),
       hiring.default_section_prompt('requirements'),
       '{}'::jsonb),
    (NEW.id, 'sourcing', 'Sourcing', 'structured', 2,
       true, true,
       hiring.default_section_schema('sourcing'),
       hiring.default_section_prompt('sourcing'),
       '{}'::jsonb),
    (NEW.id, 'outreach_sequence', 'Outreach Sequence', 'sequence', 3,
       true, true,
       hiring.default_section_schema('outreach_sequence'),
       hiring.default_section_prompt('outreach_sequence'),
       '{}'::jsonb),
    (NEW.id, 'hiring_process', 'Interview Process', 'structured', 4,
       true, true,
       hiring.default_section_schema('hiring_process'),
       hiring.default_section_prompt('hiring_process'),
       '{}'::jsonb),
    (NEW.id, 'application_questions', 'Application Questions', 'structured', 5,
       true, true,
       hiring.default_section_schema('application_questions'),
       hiring.default_section_prompt('application_questions'),
       '{}'::jsonb),
    (NEW.id, 'ai_interview_questions', 'AI Interview', 'structured', 6,
       true, true,
       hiring.default_section_schema('ai_interview_questions'),
       hiring.default_section_prompt('ai_interview_questions'),
       '{}'::jsonb),
    (NEW.id, 'talental_interview_script', 'Talental Interview Script', 'markdown', 7,
       true, true,
       hiring.default_section_schema('talental_interview_script'),
       hiring.default_section_prompt('talental_interview_script'),
       '{}'::jsonb)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$fn$;
