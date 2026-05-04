// Format credit display: "1-6", "3", or "—" (unknown)
export function formatCredits(credits: number | null | undefined, maxCredits: number | null | undefined): string {
  if (typeof credits !== "number") return "—";
  if (typeof maxCredits === "number") return `${credits}-${maxCredits}`;
  return `${credits}`;
}