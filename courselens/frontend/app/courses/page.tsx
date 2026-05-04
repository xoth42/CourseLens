"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import CourseSummaryCard, { type CourseListItem } from "@/components/CourseSummaryCard";
import RequestCourseModal from "@/components/RequestCourseModal";
import { Slider } from "@/components/Slider";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_COMPARE = 4;

type SortBy =
  | ""
  | "code"
  | "name"
  | "rating"
  | "difficulty"
  | "gpa"
  | "credits";

type SortDirection = "asc" | "desc";

type Course = CourseListItem & {
  id: number;
  code: string;
  name: string;
  professor: string;
  rating: number;
  difficulty: number;
  reviews: number;
  department: string;
  college: string | null;
  avg_gpa: number;
  credits?: number | null;
  max_credits?: number | null;
};

// Maps raw SPIRE college names to short user-facing labels for the dropdown.
// Strip "College of" / "School of" prefixes and named honorifics (Manning, Isenberg).
const COLLEGE_DISPLAY: Record<string, string> = {
  "College of Education":                              "Education",
  "College of Engineering":                            "Engineering",
  "College of Humanities & Fine Arts":                 "Humanities & Fine Arts",
  "College of Natural Sciences":                       "Natural Sciences",
  "College of Social & Behavioral Sciences":           "Social & Behavioral Sciences",
  "Isenberg School of Management":                     "Management",
  "Manning College of Information & Computer Sciences": "Information & Computer Sciences",
  "School of Nursing":                                 "Nursing",
  "School of Public Health & Health Sciences":         "Public Health & Health Sciences",
  "Other Credit Offerings":                            "Other",
  "Non-Credit Offerings (thru CE)":                    "Other",
  "Equivalency (Pseudo) Courses":                      "Other",
};

function collegeLabel(raw: string): string {
  return COLLEGE_DISPLAY[raw] ?? raw;
}

// Common abbreviations students use that differ significantly from SPIRE subject codes.
// Order matters: longer abbreviations must come before shorter prefixes (e.g. "stats" before "stat").
const SUBJECT_SHORTHANDS: [abbr: string, full: string][] = [
  ["cs",    "compsci"],   // CS → COMPSCI
  ["ece",   "e&c-eng"],   // ECE → Electrical & Computer Engineering
  ["bme",   "bmed-eng"],  // BME → Biomedical Engineering
  ["stats", "statistc"],  // stats → STATISTC (odd SPIRE code)
  ["stat",  "statistc"],  // stat  → STATISTC
  ["mie",   "m&i-eng"],   // MIE  → Mechanical & Industrial Engineering
];

// Returns [original, expanded?].
// e.g. "cs230" → ["cs230", "compsci 230"]
//      "ece"   → ["ece",   "e&c-eng"]
//      "math"  → ["math"]  (no shorthand, original only)
function expandSearch(raw: string): string[] {
  const q = raw.trim().toLowerCase();
  const terms: string[] = [q];
  for (const [abbr, full] of SUBJECT_SHORTHANDS) {
    if (q.startsWith(abbr)) {
      const rest = q.slice(abbr.length);
      // Insert a space when the shorthand runs directly into a digit (cs230 → compsci 230)
      const expanded = full + (/^\d/.test(rest) ? " " : "") + rest;
      terms.push(expanded);
      break;
    }
  }
  return terms;
}

// Higher score = better match. Used to sort results after filtering.
//   3 — expanded shorthand term matches at the START of the course code (cs2 → compsci 2xx)
//   2 — original term matches at the START of the course code
//   1 — any term appears anywhere in the course code (incidental substring, e.g. "physics 2xx" for "cs 2")
//   0 — match is only in the course name or professor field
function scoreMatch(course: Course, terms: string[]): number {
  const lCode = course.code.toLowerCase();
  const expanded = terms[1]; // undefined when no shorthand applies
  if (expanded && lCode.startsWith(expanded)) return 3;
  if (lCode.startsWith(terms[0])) return 2;
  if (terms.some((t) => lCode.includes(t))) return 1;
  return 0;
}

function hideUnrated(a: Course, b: Course, prop: "rating" | "difficulty" | "avg_gpa"): number {
  const av = a[prop];
  const bv = b[prop];
  if (av === 0 && bv !== 0) return 1;
  if (bv === 0 && av !== 0) return -1;
  if (av === 0 && bv === 0) return 0;
  return -2;
}

function sortByLabel(field: SortBy): string {
  if (field === "code") return "Code A-Z";
  if (field === "name") return "Name";
  if (field === "rating") return "Rating";
  if (field === "difficulty") return "Difficulty";
  if (field === "gpa") return "Avg Grade";
  if (field === "credits") return "Credits";
  return "Sort by...";
}

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [creditsRange, setCreditsRange] = useState<[number, number]>([1, 6]);
  const [courseLevelRange, setCourseLevelRange] = useState<[number, number]>([100, 600]);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<number>>(new Set());
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase.from("course_metrics").select("*");
      if (!error && data) setCourses(data as Course[]);
      setLoading(false);
    }
    fetchCourses();
  }, []);

  // Normalize raw numeric course codes into level buckets.
  function getCourseLevel(code: string): number | null {
    const match = code.match(/\d+/);
    if (!match) return null;
    const num = parseInt(match[0]);
    if (num < 100) return null;
    if (num < 200) return 100;
    if (num < 300) return 200;
    if (num < 400) return 300;
    if (num < 500) return 400;
    if (num < 600) return 500;
    return 600;
  }

  const collegeOptions = Array.from(
    new Set(
      courses
        .map((c) => (c.college ? collegeLabel(c.college) : null))
        .filter((c): c is string => c !== null)
    )
  ).sort();

  const departmentOptions = Array.from(
    new Set(
      courses
        .filter((c) => college === "" || (c.college !== null && collegeLabel(c.college) === college))
        .map((c) => c.department)
    )
  ).sort();

  // Check if a course matches the credit filter range
  function matchesCreditsFilter(course: Course, [minCredits, maxCredits]: [number, number]): boolean {
    if (typeof course.credits !== "number") return true;

    if (typeof course.max_credits === "number") {
      return !(course.max_credits < minCredits || course.credits > maxCredits);
    }

    return course.credits >= minCredits && course.credits <= maxCredits;
  }

  // Check if a course level falls within the selected range
  function matchesCourseLevelFilter(courseLevel: number | null, [minLevel, maxLevel]: [number, number]): boolean {
    if (courseLevel === null) return false;
    return courseLevel >= minLevel && courseLevel <= maxLevel;
  }

  function handleCollegeChange(next: string) {
    setCollege(next);
    setDepartment("");
  }

  function toggleCompare(courseId: number) {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
        return next;
      }
      if (next.size >= MAX_COMPARE) {
        const oldest = next.values().next().value as number | undefined;
        if (oldest !== undefined) next.delete(oldest);
      }
      next.add(courseId);
      return next;
    });
  }

  function clearComparison() {
    setSelectedForCompare(new Set());
  }

  const selectedCoursesOrdered = Array.from(selectedForCompare)
    .map((id) => courses.find((c) => c.id === id))
    .filter((c): c is Course => c != null);

  const searchTerms = search.trim() ? expandSearch(search) : [];

  const filteredCourses = courses
    .filter((course) => {
      const lName = course.name.toLowerCase();
      const lCode = course.code.toLowerCase();
      const lProf = course.professor.toLowerCase();
      const matchesSearch =
        !search.trim() ||
        searchTerms.some((term) => lName.includes(term) || lCode.includes(term) || lProf.includes(term));

      const matchesCollege =
        college === "" || (course.college !== null && collegeLabel(course.college) === college);

      const matchesDepartment = department === "" || course.department === department;

      const courseLevel = getCourseLevel(course.code);
      const matchesLevel = matchesCourseLevelFilter(courseLevel, courseLevelRange);

      const matchesCredits = matchesCreditsFilter(course, creditsRange);

      return matchesSearch && matchesCollege && matchesDepartment && matchesLevel && matchesCredits;
    })
    .sort((a, b) => {
      if (sortBy === "code") {
        const diff = a.code.localeCompare(b.code);
        return sortDirection === "asc" ? diff : -diff;
      }

      if (sortBy === "name") {
        const diff = a.name.localeCompare(b.name);
        return sortDirection === "asc" ? diff : -diff;
      }

      if (sortBy === "rating") {
        const unrated = hideUnrated(a, b, "rating");
        if (unrated !== -2) return unrated;
        const diff = a.rating - b.rating;
        return sortDirection === "asc" ? diff : -diff;
      }

      if (sortBy === "difficulty") {
        const unrated = hideUnrated(a, b, "difficulty");
        if (unrated !== -2) return unrated;
        const diff = a.difficulty - b.difficulty;
        return sortDirection === "asc" ? diff : -diff;
      }

      if (sortBy === "gpa") {
        const unrated = hideUnrated(a, b, "avg_gpa");
        if (unrated !== -2) return unrated;
        const diff = a.avg_gpa - b.avg_gpa;
        return sortDirection === "asc" ? diff : -diff;
      }

      if (sortBy === "credits") {
        const aVal = typeof a.max_credits === "number" ? a.max_credits : (a.credits ?? 0);
        const bVal = typeof b.max_credits === "number" ? b.max_credits : (b.credits ?? 0);
        const diff = sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        if (diff !== 0) return diff;
        const aHasRange = typeof a.max_credits === "number" ? 1 : 0;
        const bHasRange = typeof b.max_credits === "number" ? 1 : 0;
        return aHasRange - bHasRange;
      }

      if (!search.trim()) return 0;
      return scoreMatch(b, searchTerms) - scoreMatch(a, searchTerms);
    });

  return (
    <div className="min-h-full flex-1 bg-gray-50 pb-32">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Browse Courses</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              className="shrink-0 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50"
            >
              Request a class
            </button>
          </div>
        </div>

        <RequestCourseModal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} />

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, code, or professor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:h-fit lg:w-72">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">Filters</h3>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">College</label>
              <Listbox value={college} onChange={handleCollegeChange}>
                <ListboxButton className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-50 data-open:bg-gray-50">
                  {college || "All Colleges"}
                  <span className="text-lg">▼</span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom"
                  transition
                  className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-1 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                >
                  <ListboxOption
                    value=""
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    All Colleges
                  </ListboxOption>
                  {collegeOptions.map((col) => (
                    <ListboxOption
                      key={col}
                      value={col}
                      className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                    >
                      {col}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">Department</label>
              <Listbox value={department} onChange={setDepartment}>
                <ListboxButton className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-50 data-open:bg-gray-50">
                  {department || "All Departments"}
                  <span className="text-lg">▼</span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom"
                  transition
                  className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-1 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                >
                  <ListboxOption
                    value=""
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    All Departments
                  </ListboxOption>
                  {departmentOptions.map((dept) => (
                    <ListboxOption
                      key={dept}
                      value={dept}
                      className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                    >
                      {dept}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </div>

            <div className="mb-4 space-y-3 border-t border-gray-200 pt-4">
              <Listbox value={sortBy} onChange={setSortBy}>
                <ListboxButton className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-50 data-open:bg-gray-50">
                  {sortByLabel(sortBy)}
                  <span className="text-lg">▼</span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom"
                  transition
                  className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-1 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                >
                  <ListboxOption
                    value=""
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    None
                  </ListboxOption>
                  <ListboxOption
                    value="code"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Code A-Z
                  </ListboxOption>
                  <ListboxOption
                    value="name"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Name
                  </ListboxOption>
                  <ListboxOption
                    value="rating"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Rating
                  </ListboxOption>
                  <ListboxOption
                    value="difficulty"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Difficulty
                  </ListboxOption>
                  <ListboxOption
                    value="gpa"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Avg Grade
                  </ListboxOption>
                  <ListboxOption
                    value="credits"
                    className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                  >
                    Credits
                  </ListboxOption>
                </ListboxOptions>
              </Listbox>

              {sortBy && (
                <Listbox value={sortDirection} onChange={setSortDirection}>
                  <ListboxButton className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-50 data-open:bg-gray-50">
                    {sortDirection === "asc" ? "↑ Ascending" : "↓ Descending"}
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-1 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                  >
                    <ListboxOption
                      value="asc"
                      className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                    >
                      ↑ Ascending
                    </ListboxOption>
                    <ListboxOption
                      value="desc"
                      className="cursor-pointer rounded px-3 py-2 text-sm text-gray-900 transition-colors data-focus:bg-blue-50"
                    >
                      ↓ Descending
                    </ListboxOption>
                  </ListboxOptions>
                </Listbox>
              )}
            </div>

            <div className="relative mb-4 border-t border-gray-200 pt-4">
              <Listbox value="" onChange={() => {}}>
                <ListboxButton className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left font-semibold text-gray-800 transition-colors hover:bg-gray-100 data-open:bg-gray-100">
                  <span className="text-sm">
                    Credits: {creditsRange[0]}-{creditsRange[1] === 6 ? "6+" : creditsRange[1]}
                  </span>
                  <span className="text-lg">▼</span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom"
                  transition
                  className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-4 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                >
                  <div className="pointer-events-auto w-48">
                    <div className="mb-3 text-center text-sm font-medium text-gray-600">
                      {creditsRange[0]} - {creditsRange[1] === 6 ? "6+" : creditsRange[1]}
                    </div>
                    <Slider
                      value={creditsRange}
                      onValueChange={(v) => setCreditsRange([v[0], v[1]])}
                      min={1}
                      max={6}
                      step={1}
                      minStepsBetweenThumbs={0}
                    />
                  </div>
                </ListboxOptions>
              </Listbox>
            </div>

            <div className="relative border-t border-gray-200 pt-4">
              <Listbox value="" onChange={() => {}}>
                <ListboxButton className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left font-semibold text-gray-800 transition-colors hover:bg-gray-100 data-open:bg-gray-100">
                  <span className="text-sm">
                    Level: {courseLevelRange[0]}-{courseLevelRange[1] === 600 ? "600+" : courseLevelRange[1]}
                  </span>
                  <span className="text-lg">▼</span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom"
                  transition
                  className="z-10 origin-top rounded-lg border border-gray-200 bg-white p-4 shadow-lg transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0"
                >
                  <div className="pointer-events-auto w-48">
                    <div className="mb-3 text-center text-sm font-medium text-gray-600">
                      {courseLevelRange[0]} - {courseLevelRange[1] === 600 ? "600+" : courseLevelRange[1]}
                    </div>
                    <Slider
                      value={courseLevelRange}
                      onValueChange={(v) => setCourseLevelRange([v[0], v[1]])}
                      min={100}
                      max={600}
                      step={100}
                      minStepsBetweenThumbs={0}
                    />
                  </div>
                </ListboxOptions>
              </Listbox>
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <p className="mb-4 text-sm text-gray-400">
              {loading ? "Loading..." : `${filteredCourses.length} course${filteredCourses.length !== 1 ? "s" : ""} found`}
            </p>

            <div className="flex flex-col gap-4">
              {loading ? (
                <p className="py-16 text-center text-gray-400">Loading courses...</p>
              ) : filteredCourses.length === 0 ? (
                <p className="py-16 text-center text-gray-400">No courses match your search.</p>
              ) : (
                filteredCourses.map((course) => (
                  <CourseSummaryCard
                    key={course.id}
                    course={course}
                    selectable
                    selected={selectedForCompare.has(course.id)}
                    onToggleSelect={toggleCompare}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <aside
        className={`fixed bottom-5 left-1/2 z-20 flex w-[min(930px,calc(100%-26px))] -translate-x-1/2 items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white/95 px-3 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 sm:px-4 ${
          selectedForCompare.size > 0
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[130%] opacity-0"
        }`}
        aria-live="polite"
        aria-label="Course comparison selection"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="shrink-0 text-sm font-extrabold text-emerald-950">
            {selectedForCompare.size} of {MAX_COMPARE} selected
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCoursesOrdered.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-blue-900"
              >
                {c.code}
                <button
                  type="button"
                  onClick={() => toggleCompare(c.id)}
                  className="font-black leading-none text-blue-900 hover:text-blue-700"
                  aria-label={`Remove ${c.code} from comparison`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={clearComparison}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={selectedForCompare.size < 2}
            onClick={() => {
              if (selectedForCompare.size < 2) return;
              router.push(`/courses/compare?ids=${Array.from(selectedForCompare).join(",")}`);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Compare selected
          </button>
        </div>
      </aside>
    </div>
  );
}
