"use client";

import Link from "next/link";
import type { Key, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { gpaToLetter } from "@/lib/gpa";
import { formatCredits } from "@/lib/courseFormat";
import type { Course } from "@/types/course";

const MAX_COMPARE = 4;

type ComparePlotType =
  | "distribution"
  | "over-time"
  | "per-instructor"
  | "hours"
  | "difficulty-grade";

const PLOT_OPTIONS: { value: ComparePlotType; label: string }[] = [
  { value: "distribution", label: "Grade distribution" },
  { value: "over-time", label: "Grade over time" },
  { value: "per-instructor", label: "Grade per instructor" },
  { value: "hours", label: "Hours per week" },
  { value: "difficulty-grade", label: "Difficulty vs grade" },
];

const GRADE_DISTRIBUTION_LABELS = ["A", "A-", "B+", "B", "B-", "C+", "C", "D/F"] as const;

const HOURS_LABELS = ["0–5", "6–10", "11–15", "16–20", "21+"] as const;

type EvalRow = {
  course_id: number;
  grade: string | null;
  semester: string | null;
  professor_name: string | null;
  rating: number;
  difficulty: number;
  hours_per_week: number | null;
};

type CompareCourse = Course & {
  evaluationRows: EvalRow[];
  distribution: number[];
  gradeSampleSize: number;
};

type CourseCompareViewProps = {
  initialSelectedIds: number[];
};

function uniqueOrderedIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

function bestIndices(values: number[], mode: "max" | "min"): number[] {
  if (values.length === 0) return [];
  const target = mode === "max" ? Math.max(...values) : Math.min(...values);
  return values
    .map((v, i) => ({ v, i }))
    .filter((item) => item.v === target)
    .map((item) => item.i);
}

function normalizeGrade(grade: string | null): string | null {
  if (!grade) return null;
  const cleaned = grade.trim().toUpperCase();
  const allowed = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
  return allowed.includes(cleaned) ? cleaned : null;
}

function gradeToPoints(letter: string): number {
  switch (letter) {
    case "A":
      return 4.0;
    case "A-":
      return 3.7;
    case "B+":
      return 3.3;
    case "B":
      return 3.0;
    case "B-":
      return 2.7;
    case "C+":
      return 2.3;
    case "C":
      return 2.0;
    case "C-":
      return 1.7;
    case "D+":
      return 1.3;
    case "D":
      return 1.0;
    default:
      return 0.0;
  }
}

function semesterSortValue(semester: string): number {
  const match = semester.match(/(Spring|Summer|Fall)\s+(\d{4})/i);
  if (!match) return 0;
  const term = match[1].toLowerCase();
  const year = Number(match[2]);
  let termValue = 0;
  if (term === "spring") termValue = 1;
  if (term === "summer") termValue = 2;
  if (term === "fall") termValue = 3;
  return year * 10 + termValue;
}

function gradeBucketIndex(grade: string): number {
  if (grade === "A") return 0;
  if (grade === "A-") return 1;
  if (grade === "B+") return 2;
  if (grade === "B") return 3;
  if (grade === "B-") return 4;
  if (grade === "C+") return 5;
  if (grade === "C" || grade === "C-") return 6;
  return 7;
}

function buildDistribution(grades: (string | null)[]): { distribution: number[]; sampleSize: number } {
  const counts = new Array(GRADE_DISTRIBUTION_LABELS.length).fill(0);
  for (const rawGrade of grades) {
    const grade = normalizeGrade(rawGrade);
    if (!grade) continue;
    counts[gradeBucketIndex(grade)] += 1;
  }
  const sampleSize = counts.reduce((sum, count) => sum + count, 0);
  if (sampleSize === 0) {
    return { distribution: new Array(GRADE_DISTRIBUTION_LABELS.length).fill(0), sampleSize: 0 };
  }
  return {
    distribution: counts.map((count) => (count / sampleSize) * 100),
    sampleSize,
  };
}

function plotMetaFromRows(rows: EvalRow[], plot: ComparePlotType): { values: number[]; labels: string[]; footnote: string } {
  if (plot === "distribution") {
    const grades = rows.map((r) => r.grade);
    const { distribution, sampleSize } = buildDistribution(grades);
    return {
      values: distribution,
      labels: [...GRADE_DISTRIBUTION_LABELS],
      footnote:
        sampleSize > 0
          ? "Percent of evaluations with a letter grade, bucketed as shown."
          : "No letter grades in evaluations yet.",
    };
  }

  if (plot === "over-time") {
    const map: Record<string, number[]> = {};
    for (const r of rows) {
      if (!r.semester || !r.grade) continue;
      const g = normalizeGrade(r.grade);
      if (!g) continue;
      if (!map[r.semester]) map[r.semester] = [];
      map[r.semester].push(gradeToPoints(g));
    }
    const sorted = Object.entries(map)
      .map(([semester, vals]) => ({
        semester,
        value: vals.reduce((a, b) => a + b, 0) / vals.length,
      }))
      .sort((a, b) => semesterSortValue(a.semester) - semesterSortValue(b.semester));
    const values = sorted.map((x) => (x.value / 4) * 100);
    return {
      values,
      labels: sorted.map((x) => x.semester),
      footnote: "Average letter-grade points by term (normalized for bar height).",
    };
  }

  if (plot === "per-instructor") {
    const map: Record<string, number[]> = {};
    for (const r of rows) {
      if (!r.professor_name || !r.grade) continue;
      const g = normalizeGrade(r.grade);
      if (!g) continue;
      if (!map[r.professor_name]) map[r.professor_name] = [];
      map[r.professor_name].push(gradeToPoints(g));
    }
    const entries = Object.entries(map)
      .map(([name, vals]) => ({
        name,
        n: vals.length,
        value: vals.reduce((a, b) => a + b, 0) / vals.length,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
    return {
      values: entries.map((x) => (x.value / 4) * 100),
      labels: entries.map((x) => x.name),
      footnote: "Up to eight instructors with the most graded evaluations.",
    };
  }

  if (plot === "hours") {
    const buckets = [0, 0, 0, 0, 0];
    for (const r of rows) {
      const h = r.hours_per_week;
      if (h == null) continue;
      if (h <= 5) buckets[0]++;
      else if (h <= 10) buckets[1]++;
      else if (h <= 15) buckets[2]++;
      else if (h <= 20) buckets[3]++;
      else buckets[4]++;
    }
    const max = Math.max(...buckets, 1);
    const values = buckets.map((c) => (c / max) * 100);
    return {
      values,
      labels: [...HOURS_LABELS],
      footnote: "Count of reviews reporting hours per week (bucketed).",
    };
  }

  const map: Record<string, number[]> = {};
  for (const r of rows) {
    if (!r.grade) continue;
    const g = normalizeGrade(r.grade);
    if (!g) continue;
    const key = String(Math.round(r.difficulty));
    if (!map[key]) map[key] = [];
    map[key].push(gradeToPoints(g));
  }
  const order = ["1", "2", "3", "4", "5"];
  const values = order.map((k) => {
    const vals = map[k];
    if (!vals?.length) return 0;
    return ((vals.reduce((a, b) => a + b, 0) / vals.length) / 4) * 100;
  });
  return {
    values,
    labels: order.map((k) => `Diff ${k}`),
    footnote: "Average letter-grade points by rounded difficulty (1–5).",
  };
}

function plotRowLabel(plot: ComparePlotType): string {
  switch (plot) {
    case "distribution":
      return "Grade distribution";
    case "over-time":
      return "Grade over time";
    case "per-instructor":
      return "Grade per instructor";
    case "hours":
      return "Hours per week";
    case "difficulty-grade":
      return "Difficulty vs grade";
    default:
      return "Chart";
  }
}

function MiniBarsChart({ values, onClick }: { values: number[]; onClick?: () => void }) {
  const max = Math.max(...values, 1);
  const inner = (
    <div className="flex h-[42px] max-w-[145px] items-end gap-1">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-3 rounded-t-sm bg-gradient-to-b from-sky-300 to-blue-600"
          style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cursor-pointer rounded-lg border border-blue-200 bg-sky-50/80 p-2 text-left transition-colors hover:border-blue-400"
      >
        {inner}
        <div className="mt-1 text-[0.74rem] text-slate-600">Click to expand</div>
      </button>
    );
  }
  return inner;
}

export default function CourseCompareView({ initialSelectedIds }: CourseCompareViewProps) {
  const selectedIds = useMemo(() => uniqueOrderedIds(initialSelectedIds), [initialSelectedIds]);

  const [courses, setCourses] = useState<CompareCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlot, setSelectedPlot] = useState<ComparePlotType>("distribution");
  const [modal, setModal] = useState<{
    course: CompareCourse;
    plot: ComparePlotType;
    values: number[];
    labels: string[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      if (selectedIds.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const [{ data: metricsData, error: metricsError }, { data: evalData, error: evalError }] =
        await Promise.all([
          supabase.from("course_metrics").select("*").in("id", selectedIds),
          supabase
            .from("course_evaluations")
            .select("course_id, grade, semester, professor_name, rating, difficulty, hours_per_week")
            .in("course_id", selectedIds),
        ]);

      if (metricsError || evalError || !metricsData) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const rows = (evalData ?? []) as EvalRow[];
      const rowsByCourse = new Map<number, EvalRow[]>();
      for (const row of rows) {
        const list = rowsByCourse.get(row.course_id) ?? [];
        list.push(row);
        rowsByCourse.set(row.course_id, list);
      }

      const byId = new Map((metricsData as Course[]).map((c) => [c.id, c]));
      const ordered: CompareCourse[] = [];
      for (const id of selectedIds) {
        const base = byId.get(id);
        if (!base) continue;
        const evaluationRows = rowsByCourse.get(id) ?? [];
        const grades = evaluationRows.map((r) => r.grade);
        const { distribution, sampleSize } = buildDistribution(grades);
        ordered.push({ ...base, evaluationRows, distribution, gradeSampleSize: sampleSize });
      }
      setCourses(ordered);
      setLoading(false);
    }
    load();
  }, [selectedIds]);

  const openModal = useCallback((course: CompareCourse) => {
    const { values, labels } = plotMetaFromRows(course.evaluationRows, selectedPlot);
    setModal({ course, plot: selectedPlot, values, labels });
  }, [selectedPlot]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal]);

  const plotFootnote = useMemo(() => {
    if (courses.length === 0) return "";
    return plotMetaFromRows(courses[0].evaluationRows, selectedPlot).footnote;
  }, [courses, selectedPlot]);

  function ComparisonTable() {
    if (courses.length === 0) return null;

    const compared = courses;
    const gpaVals = compared.map((c) => c.avg_gpa);
    const ratingVals = compared.map((c) => c.rating);
    const diffVals = compared.map((c) => c.difficulty);
    const reviewVals = compared.map((c) => c.reviews);

    const bestGpa = bestIndices(gpaVals, "max");
    const bestRating = bestIndices(ratingVals, "max");
    const bestDiff = bestIndices(diffVals, "min");
    const bestReviews = bestIndices(reviewVals, "max");

    function cell(key: Key, content: ReactNode, isBest: boolean) {
      return (
        <td
          key={key}
          className="min-w-[170px] border-b border-emerald-100/80 px-3.5 py-3 text-sm font-semibold text-slate-800"
        >
          {isBest ? (
            <span className="inline-block rounded-lg bg-green-100 px-1.5 py-0.5 font-extrabold text-green-900">
              {content}
            </span>
          ) : (
            content
          )}
        </td>
      );
    }

    return (
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-semibold text-slate-800">Comparison chart</span>
          <select
            value={selectedPlot}
            onChange={(e) => setSelectedPlot(e.target.value as ComparePlotType)}
            className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            aria-label="Chart type"
          >
            {PLOT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <table className="min-w-[700px] w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] w-[230px] border-b border-emerald-100/80 bg-emerald-50/90 px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Feature
              </th>
              {compared.map((c) => (
                <th
                  key={c.id}
                  className="border-b border-emerald-100/80 bg-slate-50 px-3.5 py-3 text-sm text-slate-800"
                >
                  <Link
                    href={`/courses/${c.id}`}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {c.code}
                  </Link>
                  <div className="mt-0.5 text-xs font-normal text-slate-500">{c.professor}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-emerald-100/80 bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                Avg. GPA
              </td>
              {compared.map((c, idx) =>
                cell(
                  c.id,
                  `${gpaToLetter(c.avg_gpa)} (${c.avg_gpa > 0 ? c.avg_gpa.toFixed(2) : "—"})`,
                  bestGpa.includes(idx)
                )
              )}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-emerald-100/80 bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                Credits
              </td>
              {compared.map((c) => (
                <td
                  key={c.id}
                  className="border-b border-emerald-100/80 px-3.5 py-3 text-sm font-semibold text-slate-800"
                >
                  {formatCredits(c.credits, c.max_credits)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-emerald-100/80 bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                {plotRowLabel(selectedPlot)}
              </td>
              {compared.map((c) => {
                const { values } = plotMetaFromRows(c.evaluationRows, selectedPlot);
                const empty = values.length === 0 || values.every((v) => v === 0);
                return (
                  <td
                    key={c.id}
                    className="border-b border-emerald-100/80 px-3.5 py-3 text-sm font-semibold text-slate-800"
                  >
                    {empty ? (
                      <span className="text-xs text-slate-400">No data</span>
                    ) : (
                      <MiniBarsChart values={values} onClick={() => openModal(c)} />
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-emerald-100/80 bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                Overall rating
              </td>
              {compared.map((c, idx) =>
                cell(c.id, `${c.rating.toFixed(1)} / 5`, bestRating.includes(idx))
              )}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-emerald-100/80 bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                Difficulty
              </td>
              {compared.map((c, idx) =>
                cell(c.id, `${c.difficulty.toFixed(1)} / 5`, bestDiff.includes(idx))
              )}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] bg-slate-50/95 px-3.5 py-3 text-sm font-bold text-emerald-900">
                Reviews
              </td>
              {compared.map((c, idx) =>
                cell(c.id, String(c.reviews), bestReviews.includes(idx))
              )}
            </tr>
          </tbody>
        </table>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-slate-500">{plotFootnote}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading comparison…</p>
      </div>
    );
  }

  if (selectedIds.length < 2) {
    return (
      <div className="min-h-full flex-1 bg-gray-50">
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Link href="/courses" className="mb-6 inline-block text-sm text-blue-600 hover:underline">
            ← Back to courses
          </Link>
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Compare courses</h1>
            <p className="mt-3 text-sm text-gray-600">
              Select at least two courses on the browse page, then use <strong>Compare selected</strong>.
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Go to browse courses
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (courses.length < 2) {
    return (
      <div className="min-h-full flex-1 bg-gray-50">
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Link href="/courses" className="mb-6 inline-block text-sm text-blue-600 hover:underline">
            ← Back to courses
          </Link>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-8 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Could not load comparison</h1>
            <p className="mt-3 text-sm text-gray-700">
              Fewer than two of the selected courses were found. Return to the course list and try again.
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to browse courses
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 bg-gray-50 pb-10">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/courses" className="mb-6 inline-block text-sm text-blue-600 hover:underline">
          ← Back to courses
        </Link>

        <section aria-label="Course comparison">
          <header className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Compare courses</h1>
            <p className="mt-1 text-sm text-gray-600">
              {courses.length} course{courses.length === 1 ? "" : "s"} — metrics and evaluation-based charts.
            </p>
          </header>
          <ComparisonTable />
        </section>
      </main>

      {modal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Chart detail"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-[700px] overflow-y-auto rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {modal.course.code} — {plotRowLabel(modal.plot).toLowerCase()}
                </h3>
                <p className="text-sm text-gray-500">
                  {modal.course.name} · {modal.course.professor}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl leading-none text-gray-700 hover:bg-gray-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4">
              <div className="flex h-[220px] items-end gap-1.5 border-b-2 border-l-2 border-emerald-400/80 pb-2 pl-2 pt-1">
                {modal.values.map((value, i) => {
                  const max = Math.max(...modal.values, 1);
                  const h = Math.max(8, Math.round((value / max) * 170));
                  return (
                    <div
                      key={i}
                      className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <span
                        className="w-full max-w-[56px] rounded-t-lg bg-gradient-to-b from-sky-400 to-blue-600"
                        style={{ height: `${h}px` }}
                      />
                      <div className="line-clamp-2 text-center text-[0.65rem] font-bold leading-tight text-slate-600">
                        {modal.labels[i] ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {plotMetaFromRows(modal.course.evaluationRows, modal.plot).footnote}
                {modal.plot === "distribution" && modal.course.gradeSampleSize > 0 ? (
                  <> Evaluations with a letter grade: {modal.course.gradeSampleSize}.</>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
