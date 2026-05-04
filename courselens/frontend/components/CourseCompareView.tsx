"use client";

import Link from "next/link";
import type { Key, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { gpaToLetter } from "@/lib/gpa";
import { formatCredits } from "@/lib/courseFormat";
import {
  GRADE_DISTRIBUTION_LABELS,
  illustrativeSharesFromAvgGpa,
} from "@/lib/illustrative-grade-distribution";
import type { Course } from "@/types/course";

const MAX_COMPARE = 4;

function bestIndices(values: number[], mode: "max" | "min"): number[] {
  if (values.length === 0) return [];
  const target = mode === "max" ? Math.max(...values) : Math.min(...values);
  return values
    .map((v, i) => ({ v, i }))
    .filter((item) => item.v === target)
    .map((item) => item.i);
}

type CompareCourse = Course & { distribution: number[] };

function enrichCourse(c: Course): CompareCourse {
  return {
    ...c,
    distribution: illustrativeSharesFromAvgGpa(c.avg_gpa),
  };
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-1.5 flex h-[34px] items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="block w-2.5 rounded-t-sm bg-gradient-to-b from-sky-400 to-blue-600 opacity-90"
          style={{ height: `${Math.max(7, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
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

export default function CourseCompareView() {
  const [courses, setCourses] = useState<CompareCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"list" | "compare">("list");
  const [modalCourse, setModalCourse] = useState<CompareCourse | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("course_metrics").select("*");
      if (!error && data) {
        setCourses((data as Course[]).map(enrichCourse));
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.professor.toLowerCase().includes(q)
    );
  }, [courses, search]);

  const selectedCourses = useMemo(() => {
    return courses.filter((c) => selected.has(c.id));
  }, [courses, selected]);

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size < MAX_COMPARE) {
        next.add(id);
        return next;
      }
      const oldest = next.values().next().value as number;
      next.delete(oldest);
      next.add(id);
      return next;
    });
  }, []);

  const removeSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const count = selected.size;
  const trayVisible = count > 0;

  useEffect(() => {
    if (!modalCourse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalCourse(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalCourse]);

  const compared = selectedCourses;

  function ComparisonTable() {
    if (compared.length === 0) return null;

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
                Illustrative grade mix
              </td>
              {compared.map((c) => (
                <td
                  key={c.id}
                  className="border-b border-emerald-100/80 px-3.5 py-3 text-sm font-semibold text-slate-800"
                >
                  <MiniBarsChart
                    values={c.distribution}
                    onClick={() => setModalCourse(c)}
                  />
                </td>
              ))}
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
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-slate-500">
          Illustrative grade bars are inferred from mean GPA for layout only, not official
          registrar data.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 bg-gray-50 pb-36">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/courses"
          className="mb-6 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Back to courses
        </Link>

        {view === "list" && (
          <section aria-label="Course list for comparison">
            <header className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Compare courses</h1>
                <p className="mt-1 text-sm text-gray-600">
                  Pick up to four courses, then compare ratings, difficulty, and GPA side by side.
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-emerald-900 shadow-sm">
                {count} / {MAX_COMPARE} selected
              </div>
            </header>

            <div className="mb-4">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, code, or professor…"
                className="w-full max-w-xl rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {loading ? (
              <p className="py-16 text-center text-gray-400">Loading courses…</p>
            ) : filtered.length === 0 ? (
              <p className="py-16 text-center text-gray-400">No courses match your filter.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((course) => {
                  const isSel = selected.has(course.id);
                  return (
                    <article
                      key={course.id}
                      className={`relative grid gap-3 overflow-hidden rounded-2xl border bg-white p-4 pl-14 shadow-sm transition-all sm:grid-cols-[1.3fr_1fr_0.6fr_0.85fr_1fr] sm:items-center sm:gap-3.5 ${
                        isSel
                          ? "border-blue-300 bg-sky-50/40 ring-1 ring-blue-200"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-blue-200/40 to-emerald-300/50 opacity-0 transition-opacity"
                        style={{ opacity: isSel ? 1 : 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleSelect(course.id)}
                        className={`absolute left-3 top-3 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors ${
                          isSel
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        }`}
                      >
                        {isSel ? "✓ Selected" : "+ Compare"}
                      </button>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold leading-snug text-gray-900">
                          <Link
                            href={`/courses/${course.id}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {course.name}
                          </Link>
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">{course.professor}</p>
                      </div>
                      <div>
                        <div className="text-[0.74rem] font-bold uppercase tracking-wide text-slate-500">
                          Avg. GPA
                        </div>
                        <span className="mt-0.5 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                          {gpaToLetter(course.avg_gpa)}
                          {course.avg_gpa > 0 ? ` (${course.avg_gpa.toFixed(2)})` : ""}
                        </span>
                      </div>
                      <div>
                        <div className="text-[0.74rem] font-bold uppercase tracking-wide text-slate-500">
                          Credits
                        </div>
                        <span className="mt-0.5 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                          {formatCredits(course.credits, course.max_credits)}
                        </span>
                      </div>
                      <div>
                        <div className="text-[0.74rem] font-bold uppercase tracking-wide text-slate-500">
                          Difficulty
                        </div>
                        <span className="mt-0.5 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-bold text-slate-800">
                          {course.difficulty.toFixed(1)} / 5
                        </span>
                      </div>
                      <div>
                        <div className="text-[0.74rem] font-bold uppercase tracking-wide text-slate-500">
                          Illustrative mix
                        </div>
                        <Sparkline values={course.distribution} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view === "compare" && (
          <section aria-label="Comparison table">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Side-by-side comparison
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {compared.length} course{compared.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("list")}
                className="shrink-0 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Back to list
              </button>
            </div>
            <ComparisonTable />
          </section>
        )}
      </main>

      <aside
        className={`fixed bottom-5 left-1/2 z-20 flex w-[min(930px,calc(100%-26px))] -translate-x-1/2 items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white/95 px-3 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 sm:px-4 ${
          trayVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[130%] opacity-0"
        }`}
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="shrink-0 text-sm font-extrabold text-emerald-950">
            {count} of {MAX_COMPARE} selected
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCourses.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-blue-900"
              >
                {c.code}
                <button
                  type="button"
                  onClick={() => removeSelected(c.id)}
                  className="font-black leading-none text-blue-900 hover:text-blue-700"
                  aria-label={`Remove ${c.code}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={count < 2}
          onClick={() => {
            if (count < 2) return;
            setView("compare");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Compare
        </button>
      </aside>

      {modalCourse && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Illustrative grade distribution"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalCourse(null);
          }}
        >
          <div className="w-full max-w-[700px] rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {modalCourse.code} — illustrative mix
                </h3>
                <p className="text-sm text-gray-500">
                  {modalCourse.name} · {modalCourse.professor}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalCourse(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl leading-none text-gray-700 hover:bg-gray-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4">
              <div className="flex h-[220px] items-end gap-1.5 border-b-2 border-l-2 border-emerald-400/80 pb-2 pl-2 pt-1">
                {modalCourse.distribution.map((value, i) => {
                  const max = Math.max(...modalCourse.distribution, 1);
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
                      <div className="text-center text-[0.72rem] font-bold text-slate-600">
                        {GRADE_DISTRIBUTION_LABELS[i]}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Shares sum to 100% (illustrative). Not official grade counts. Based on course
                average GPA ({modalCourse.avg_gpa > 0 ? modalCourse.avg_gpa.toFixed(2) : "N/A"}).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
