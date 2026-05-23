// Wordmark.jsx — Talental wordmark + the descending-rules brand mark.
// The wordmark sets in DM Sans 500 with the olive period as the one
// chromatic moment. Letter-spacing tightens as size grows.

const TalentalWordmark = ({ size = 32, dark = false }) => {
  // tracking scales with size: -0.025em at body sizes, tightening to -0.04em at display
  const tracking = size >= 56 ? "-0.04em" : size >= 32 ? "-0.03em" : "-0.025em";
  return (
    <span
      style={{
        fontFamily: '"DM Sans", "Söhne", -apple-system, sans-serif',
        fontWeight: 500,
        fontSize: size,
        letterSpacing: tracking,
        lineHeight: 1,
        color: dark ? "#EFE9DB" : "var(--fg-1)",
        display: "inline-flex",
        alignItems: "baseline",
        whiteSpace: "nowrap",
      }}
    >
      Talental
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: size * 0.15,
          height: size * 0.15,
          background: dark ? "#9DAE7C" : "var(--accent)",
          borderRadius: "999px",
          marginLeft: size * 0.015,
        }}
      />
    </span>
  );
};

const TalentalMark = ({ size = 32, dark = false }) => {
  const color = dark ? "#9DAE7C" : "var(--accent)";
  const h = size * 0.07;
  const gap = size * 0.10;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap,
        alignItems: "flex-start",
        width: size,
        justifyContent: "center",
      }}
    >
      <span style={{ display: "block", width: size, height: h, background: color, borderRadius: 1 }} />
      <span style={{ display: "block", width: size * 0.62, height: h, background: color, borderRadius: 1 }} />
      <span style={{ display: "block", width: size * 0.26, height: h, background: color, borderRadius: 1 }} />
    </span>
  );
};

Object.assign(window, { TalentalWordmark, TalentalMark });
