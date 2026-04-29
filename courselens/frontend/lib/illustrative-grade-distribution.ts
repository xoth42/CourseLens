/**
 * Soft histogram around mean GPA for charts only — not official grade counts.
 * Replace when real per-letter breakdown is available from the backend.
 */
const BUCKET_MEANS = [4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.0];

export const GRADE_DISTRIBUTION_LABELS = ["A", "A-", "B+", "B", "B-", "C+", "C", "D/F"] as const;

export function illustrativeSharesFromAvgGpa(avgGpa: number): number[] {
  if (!Number.isFinite(avgGpa) || avgGpa <= 0) {
    return [13, 13, 12, 12, 13, 12, 13, 12];
  }
  const sigma = 0.52;
  const raw = BUCKET_MEANS.map((m) =>
    Math.exp(-((avgGpa - m) ** 2) / (2 * sigma * sigma))
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const floats = raw.map((w) => (w / sum) * 100);
  const rounded = floats.map((x) => Math.floor(x));
  let remainder = 100 - rounded.reduce((a, b) => a + b, 0);
  const order = floats
    .map((x, i) => ({ i, frac: x - rounded[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    rounded[order[k % order.length].i] += 1;
  }
  return rounded;
}
