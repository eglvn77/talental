import { type ParsedProfile } from "@/lib/resume-parse";

export function ParsedProfileSection({ profile }: { profile: ParsedProfile }) {
  return (
    <div className="space-y-4 text-sm">
      {profile.summary ? (
        <p className="text-muted-foreground">{profile.summary}</p>
      ) : null}

      {profile.experience.length > 0 ? (
        <Block label="Experience">
          <ul className="space-y-3">
            {profile.experience.map((e, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[e.start_date, e.end_date].filter(Boolean).join(" – ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.company}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
                {e.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {e.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {profile.education.length > 0 ? (
        <Block label="Education">
          <ul className="space-y-2">
            {profile.education.map((e, i) => (
              <li key={i}>
                <div className="font-medium">{e.school}</div>
                <div className="text-xs text-muted-foreground">
                  {[e.degree, e.field].filter(Boolean).join(", ")}
                  {e.start_year || e.end_year
                    ? ` · ${[e.start_year, e.end_year].filter(Boolean).join(" – ")}`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {profile.skills.length > 0 ? (
        <Block label="Skills">
          <div className="flex flex-wrap gap-1">
            {profile.skills.map((s) => (
              <span
                key={s}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {s}
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {profile.languages.length > 0 ? (
        <Block label="Languages">
          <div className="flex flex-wrap gap-1">
            {profile.languages.map((l) => (
              <span
                key={l}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {l}
              </span>
            ))}
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      {children}
    </div>
  );
}
