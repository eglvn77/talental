/**
 * Per-section specs extracted from the legacy monolith in
 * `default-master-prompt.ts`. Each constant is the exact text block
 * that used to live under "# <key> spec" inside the monolith — minus
 * the `# <key> spec\n\n` header, which `assembleMasterPrompt` adds
 * back so the rendered prompt is byte-identical to the original for
 * the default 7 sections in the legacy order.
 *
 * These constants are the seed source for the workspace's
 * `resource_definitions.generator_prompt` column (Phase 4a-i
 * backfill migration). The runtime assembler reads from DB, not
 * from these — kept here only as:
 *   1. the seed payload for the migration, and
 *   2. the "restore default" body when a workspace wants to revert.
 */

export const DEFAULT_REQUIREMENTS_PROMPT = String.raw`Two arrays of plain-text strings:
- must: non-negotiables, sorted most-to-least critical. Specific. "B2C experience" is a requirement. "Strong communicator" is not.
- nice: nice-to-haves, specific tools, niche experience, sorted by relevance.`;

export const DEFAULT_SOURCING_PROMPT = String.raw`Only when role_type != inbound_ai_driven.

Always in English regardless of other language settings.

- criteria: array of mandatory requirements verifiable from a LinkedIn profile in under 30 seconds. Hard filters during sourcing. Example: "5+ years in B2C growth marketing," "Based in São Paulo or willing to relocate."
- questions: array of optional/preferential requirements written as questions. Used to evaluate and rate candidates, not filter. Example: "Does the profile show evidence of data-driven work alongside brand?"
- target_companies: plain array of company names. Mix companies known to be strong in this function with companies in the client's industry (direct or adjacent competitors). If the client named target companies, those go first. Exclude any the client named to avoid. No descriptions.`;

export const DEFAULT_HIRING_PROCESS_PROMPT = String.raw`Renders as the "Interview Process" tab in the package.

Array of interview stages in order. Each stage: { order (1-indexed), who (role title only — no personal names), focus (what is evaluated at this stage), format (optional: phone/video/in-person/case) }.

For Inbound AI Driven, list AI stages first (Application Questions, AI Interview) before human stages.

ALWAYS generate at least the standard stages even when the client hasn't specified the full process — typical baseline: Talental screen → Hiring Manager video → Final loop / references. Recruiter will edit before sending to the client. Never leave this section null.`;

export const DEFAULT_APPLICATION_QUESTIONS_PROMPT = String.raw`Only when role_type != full_headhunting.

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

Cover only screening topics: location, compensation, availability, language, visa/contract, binary eliminatory experience requirements. Nuanced evaluation goes to ai_interview_questions.`;

export const DEFAULT_AI_INTERVIEW_QUESTIONS_PROMPT = String.raw`Only when role_type != full_headhunting.

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

Maximum 10 criteria total across all categories. All are preferential — eliminatory filtering happens at the application stage.`;

export const DEFAULT_TALENTAL_INTERVIEW_SCRIPT_PROMPT = String.raw`Markdown. Content varies by role_type.

For Full Headhunting:
- Fields header: Location / Job Situation / Next Steps / Interest / Current Comp / Desired Comp / Optional (Language, Contract, Office, Schedule, Availability)
- *Tell me about your current role*
- *Can you share one or two achievements you feel proud of there?*
- Role-specific probing areas (short bold label + 2-3 sub-bullets describing what good looks like, focused on most important requirements)
- *When we speak to your previous managers, how would they rate your performance on a scale of 1 to 10?*
- *Only for strong candidates: Who are the best professionals you know?*
- INTERVIEW PROCESS / ROLE PITCH / TEAM STRUCTURE / SALARY RANGE blocks

For Inbound AI Driven: only the inbound variant (skip fields already captured; focus on motivation + AI Report Review).

Use markdown headings (##, ###) and bold for sub-headers. No <details> tags.`;

export const DEFAULT_OUTREACH_SEQUENCE_PROMPT = String.raw`Only when role_type != inbound_ai_driven.

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
- Candidate is the subject of at least half the sentences.`;

/** Map system key → seed prompt. Used by the migration + restore-default flow. */
export const DEFAULT_SECTION_PROMPTS: Record<string, string> = {
  requirements: DEFAULT_REQUIREMENTS_PROMPT,
  sourcing: DEFAULT_SOURCING_PROMPT,
  hiring_process: DEFAULT_HIRING_PROCESS_PROMPT,
  application_questions: DEFAULT_APPLICATION_QUESTIONS_PROMPT,
  ai_interview_questions: DEFAULT_AI_INTERVIEW_QUESTIONS_PROMPT,
  talental_interview_script: DEFAULT_TALENTAL_INTERVIEW_SCRIPT_PROMPT,
  outreach_sequence: DEFAULT_OUTREACH_SEQUENCE_PROMPT,
};
