-- ============================================================
-- Message templates: reusable communication snippets (name +
-- subject + content) imported from Leonar before that subscription
-- lapsed. Deliberately simple: no channel/type, no per-message
-- visibility. Workspace-scoped, admin-gated writes, mirroring the
-- hiring.sources / job_closure_reasons pattern.
-- ============================================================

CREATE TABLE hiring.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Nullable: WhatsApp-style templates carry no subject line.
  subject text,
  content text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_templates_workspace_position_idx
  ON hiring.message_templates (workspace_id, position);

-- updated_at maintenance ---------------------------------------------
CREATE OR REPLACE FUNCTION hiring.tg_message_templates_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_templates_set_updated_at ON hiring.message_templates;
CREATE TRIGGER message_templates_set_updated_at
  BEFORE UPDATE ON hiring.message_templates
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_message_templates_set_updated_at();

-- RLS + GRANTs (explicit service_role grant — MCP tables don't auto-grant)
ALTER TABLE hiring.message_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.message_templates TO service_role;

CREATE POLICY tenant_select ON hiring.message_templates
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.message_templates
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.message_templates
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- Seed: the 18 templates exported from Leonar, verbatim, for the
-- Talental workspace only. Bodies dollar-quoted ($t$) to keep
-- apostrophes / newlines literal. Known quirks (duplicated phrase in
-- #17, missing space in #10, mixed {{firstName}}/{{first_name}}) are
-- preserved on purpose — editable later in the UI.
INSERT INTO hiring.message_templates (workspace_id, position, name, subject, content)
SELECT w.id, v.position, v.name, v.subject, v.content
FROM hiring.workspaces w
CROSS JOIN (VALUES
  (10, '🇲🇽 0 Resume Rejection', 'Tu aplicación para {{jobPostingTitle}}', $t$Hola {{firstName}},

Te queremos agradecer el tiempo que te tomaste para aplicar a la posición de {{jobPostingTitle}}.

Después de revisar cuidadosamente tu aplicación, lamentamos informarte que tu perfil no se ajusta exactamente a los requisitos de esta posición, por lo que no podremos invitarte a la siguiente fase del proceso de selección.

Cabe mencionar que esta decisión no refleja la calidad de tu perfil, sino la alineación con la vacante específica a la que aplicaste.

Si estás de acuerdo, conservaremos tu perfil en nuestra base de datos y te contactaremos en caso de que se abra una posición que se alinee mejor con tu perfil.

Te deseamos lo mejor y mucho éxito en tu futuro profesional!

El equipo de Talental$t$),

  (20, '🇲🇽 1 REJECT Post Client Interview', 'Tu proceso para {{jobPostingTitle}}', $t$Hola {{firstName}},

Quiero agradecerte el tiempo que dedicaste al proceso con nosotros.

A pesar de haber sido un proceso de selección muy competitivo, en esta ocasión el equipo optó por continuar con otros perfiles.

Sé que no son las noticias que esperabas, pero de cualquier forma me gustaría contactarte en el futuro si surge otra oportunidad.

Te deseo mucho éxito y no dudes en contactarme si tienes alguna pregunta.$t$),

  (30, '🇲🇽 1 REJECT Post Recruiter Interview', 'Tu proceso para {{jobPostingTitle}}', $t$Hola {{first_name}},

Quiero agradecerte por el tiempo que dedicaste a platicar conmigo para el rol de {{jobPostingTitle}}.

Fue un proceso muy competitivo y la decisión no fue fácil, pero tras evaluar a todos los candidatos, el equipo decidió continuar con otros perfiles en esta ocasión.

Me pondré en contacto si surge otra oportunidad que sea compatible con tu perfil.


Te deseo mucho éxito en lo que venga.$t$),

  (40, '🇲🇽 ASSESSMENT Send', 'Siguientes Pasos en tu Proceso', $t$Hola {{firstName}},

Quiero agradecerte por el tiempo que has invertido en el proceso hasta ahora.

Como siguiente paso, te comparto el caso práctico: {{project_variable_4}}

El caso tiene instrucciones, pero avísame si tienes alguna duda!$t$),

  (50, '🇲🇽 Inbound Outreach 15min', 'Entrevista Inicial para {{jobPostingTitle}}', $t$Hola {{firstName}},

Gracias por tu interés en nuestra vacante de {{jobPostingTitle}}.
Pude revisar tu perfil y me pareció muy interesante.

Me gustaría agendar una videollamada de 30 minutos por Google Meet para conocernos mejor y contarte más sobre la empresa y la vacante.

Puedes elegir el horario que mejor te funcione aquí: https://book.talental.mx/emanuel/15min

Una vez que elijas la fecha y la hora, recibirás el enlace de la reunión por correo electrónico (revisa tu carpeta de spam).

Quedo atento para platicar pronto.

Escríbeme aquí si tienes alguna duda: http://whatsapp.talental.mx/

Emanuel$t$),

  (60, '🇲🇽 Inbound Outreach 30min', 'Entrevista Inicial para {{jobPostingTitle}}', $t$Hola {{firstName}},

Gracias por tu interés en nuestra vacante de {{jobPostingTitle}}.
Pude revisar tu perfil y me pareció muy interesante.

Me gustaría agendar una videollamada de 30 minutos por Google Meet para conocernos mejor y contarte más sobre la empresa y la vacante.

Puedes elegir el horario que mejor te funcione aquí: https://book.talental.mx/emanuel/30min

Una vez que elijas la fecha y la hora, recibirás el enlace de la reunión por correo electrónico (revisa tu carpeta de spam).

Quedo atento para platicar pronto.

Escríbeme aquí si tienes alguna duda: http://whatsapp.talental.mx/

Emanuel$t$),

  (70, '🇲🇽 NOSHOW Follow-Up', 'Nuestra llamada', $t$Hola {{first_name}},

Teníamos una llamada programada para hoy; quería saber si tuviste algún inconveniente o si quisieras que la reagendáramos. Si es así, puedes agendar otra llamada con el mismo link.

Estoy pendiente, cualquier cosa puedes enviarme un whatsapp aquí: http://whatsapp.talental.mx/



Saludos!$t$),

  (80, '🇲🇽 PROCESS Background Check', 'Información para referencias y antecedentes', $t$Hola {{first_name}},

Estamos en la etapa final del proceso! El siguiente paso es completar el formulario de referencias y antecedentes.

Aquí está el link: http://hiring.talental.mx/background-check

Cualquier duda, me escribes.$t$),

  (90, '🇲🇽 PROCESS Comp Request', 'Información de compensación', $t$Hola {{first_name}},

Para seguir avanzando en el proceso, me puedes apoyar con la información sobre tu compensación actual y tus expectativas?

Es información confidencial y solo la usamos para asegurarnos de que el rol esté dentro de tu rango antes de seguir adelante, y en caso de una oferta.

Aquí está el formulario: https://hiring.talental.mx/comp

Cualquier duda avísame,$t$),

  (100, '🇲🇽 PROCESS Keep Warm', 'Tu proceso sigue activo', $t$Hola {{first_name}},

Te escribo solo para avisarte que tu proceso para {{jobPostingTitle}}sigue activo. Estamos coordinando los siguientes pasos con el cliente y te aviso en cuanto tenga novedades.

Gracias por la paciencia,$t$),

  (110, '🇲🇽 REJECT Casual', NULL, $t${{firstName}}, solo para confirmarte que el equipo ya pudo platicar de ti, pero esta vez decidieron avanzar con otras candidaturas

Te agradezco mucho el tiempo y el interés en la posición! me encantaría ponerme en contacto en caso de que otra oportunidad se abriera va?$t$),

  (120, '🇲🇽 REJECT Post Assessment', 'Tu proceso para {{jobPostingTitle}}', $t$Hola {{first_name}},

Gracias por tomarte el tiempo de completar el ejercicio para {{jobPostingTitle}}, se que requirió esfuerzo de tu parte.

Sin embargo, después de revisar todas las entregas, el equipo decidió avanzar con otros candidatos en esta ocasión.

Guardamos tu información para contactarte si surge una vacante que pueda hacer mejor fit.

Avísame cualquier duda,$t$),

  (130, '🇲🇽 REJECT Role Filled', 'Tu aplicación para {{jobPostingTitle}}', $t$Hola {{first_name}},

Queremos agradecerte el tiempo que te tomaste para aplicar a nuestra posición de {{jobPostingTitle}}, sin embargo, acabamos de cerrar el puesto.

Tenemos tu información en nuestra base de datos y, si estás de acuerdo, te contactaremos si se abre alguna posición compatible contigo.



Te deseamos mucho éxito,$t$),

  (140, '🇲🇽 RESCHEDULE 15min', 'Entrevista', $t$Hola {{first_name}},

Tenemos una llamada programada, te escribo para avisarte que tuve un inconveniente y no me será posible tomarla, pero me interesa mucho que platiquemos.


¿Podrías tomar la entrevista otro día? puedes agendarla aquí: https://book.talental.mx/interview-15



Disculpa los inconvenientes y estoy pendiente, saludos!$t$),

  (150, '🇲🇽 RESCHEDULE 30min', 'Entrevista', $t$Hola {{firstName}},

Tenemos una llamada programada, te escribo para avisarte que tuve un inconveniente y no me será posible tomarla, pero me interesa mucho que sí platiquemos.

¿Podrías tomar la entrevista otro día? puedes agendarla aquí: https://book.talental.mx/emanuel/chat

Disculpa los inconvenientes y estoy pendiente, saludos!$t$),

  (160, '🇺🇸 1 REJECT Post Client Interview', 'Your process for {{jobPostingTitle}}', $t$Hi {{first_name}},

I wanted to thank you for all the time you invested in this process for our {{jobPostingTitle}} role. I know it wasn't a small ask.

The team reviewed all candidates in the process and, after careful consideration, has decided to move forward with another candidate at this time.

I'll reach out if another opportunity comes up that could be a better fit.

Wishing you all the best, and feel free to reach out if you have any questions.$t$),

  (170, '🇺🇸 1 REJECT Post Recruiter Interview', 'Your process for {{jobPostingTitle}}', $t$Hi {{firstName}},

Thanks for taking the time to chat with me regarding the {{jobPostingTitle}} role.

After carefully reviewing all candidates, the team has decided to After carefully reviewing all candidates, the team has decided to move forward with other profiles this time. The selection process was highly competitive, making the decision difficult, but they ultimately chose another direction.

I know this is not the best news, but I'd love to reach out to you in the future if another opportunity arises.

Wishing you the best,$t$),

  (180, '🇺🇸 ASSESSMENT Send', 'Next step in your process', $t$Hi {{firstName}},

Thank you for the time you've dedicated to this process so far. We're making solid progress.

As the next step, I'm sharing the assessment: (ASSESSMENT LINK)

It contains instructions, but please feel free to reach out if you have any questions.$t$)
) AS v(position, name, subject, content)
WHERE w.slug = 'talental';
