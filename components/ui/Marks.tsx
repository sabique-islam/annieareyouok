const SIGNAL_LABEL: Record<string, string> = {
  overpriced: "Ask high",
  underpriced: "Ask low",
  fair: "Ask fair",
  unpriced: "Unpriced",
};

export function GradeStamp({ grade }: { grade: string | null }) {
  if (!grade) return <span className="stamp stamp-empty">Ungraded</span>;
  return <span className={`stamp stamp-${grade}`}>{grade}</span>;
}

export function Signal({ value }: { value: string | null }) {
  const key = value || "unpriced";
  return <span className={`signal signal-${key}`}>{SIGNAL_LABEL[key] ?? key}</span>;
}

export function ResultPill({ result }: { result: string }) {
  const color =
    result === "pass" ? "text-pass" : result === "fail" ? "text-stamp" : "text-amber";
  return <span className={color}>{result.replaceAll("_", " ")}</span>;
}
