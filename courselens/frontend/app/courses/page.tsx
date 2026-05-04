"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { supabase } from "@/lib/supabase/client";
import CourseSummaryCard, { type CourseListItem } from "@/components/CourseSummaryCard";
import { Slider } from "@/components/Slider";
import RequestCourseModal from "@/components/RequestCourseModal";
import { formatCredits } from "@/lib/courseFormat";

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

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");
  const [sortField, setSortField] = useState<"" | "code" | "credits">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [creditsRange, setCreditsRange] = useState<[number, number]>([1, 6]);
  const [courseLevelRange, setCourseLevelRange] = useState<[number, number]>([100, 600]);
  const [requestModalOpen, setRequestModalOpen] = useState(false);


  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase.from("course_metrics").select("*");
      if (!error && data) setCourses(data);
      setLoading(false);
    }
    fetchCourses();
  }, []);

  function getCourseNumber(code: string): number {
    const match = code.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  // Extract course level from course code (e.g., "CS230" → 200)
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

    // If course has a max_credits (range), check if it overlaps with filter range
    if (typeof course.max_credits === "number") {
      return !(course.max_credits < minCredits || course.credits > maxCredits);
    }
    // Fixed credit: check if it's within filter range
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

  const searchTerms = search.trim() ? expandSearch(search) : [];

  const filteredCourses = courses
    .filter((course) => {
      const lName = course.name.toLowerCase();
      const lCode = course.code.toLowerCase();
      const lProf = course.professor.toLowerCase();
      const matchesSearch =
        !search.trim() ||
        searchTerms.some((term) =>
          lName.includes(term) || lCode.includes(term) || lProf.includes(term)
        );

      const matchesCollege =
        college === "" || (course.college !== null && collegeLabel(course.college) === college);

      const matchesDepartment =
        department === "" || course.department === department;

      const courseLevel = getCourseLevel(course.code);
      const matchesLevel = matchesCourseLevelFilter(courseLevel, courseLevelRange);

      const matchesCredits = matchesCreditsFilter(course, creditsRange);

      return matchesSearch && matchesCollege && matchesDepartment && matchesLevel && matchesCredits;
    })
    .sort((a, b) => {
      if (sortField === "code") {
        const aNum = getCourseNumber(a.code);
        const bNum = getCourseNumber(b.code);
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      if (sortField === "credits") {
        const aVal = typeof a.max_credits === "number" ? a.max_credits : (a.credits ?? 0);
        const bVal = typeof b.max_credits === "number" ? b.max_credits : (b.credits ?? 0);
        const diff = sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        if (diff !== 0) return diff;
        const aHasRange = typeof a.max_credits === "number" ? 1 : 0;
        const bHasRange = typeof b.max_credits === "number" ? 1 : 0;
        return aHasRange - bHasRange; // fixed (0) before ranges (1)
      }
      if (!search.trim()) return 0;
      return scoreMatch(b, searchTerms) - scoreMatch(a, searchTerms);
    });

  return (
    <div className="min-h-full flex-1 bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Browse Courses</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/courses/compare"
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Compare courses
            </Link>
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

        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, code, or professor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </main>

      {/* Main Layout: Left Sidebar + Right Content (Full Width) */}
      <div className="flex">
        {/* Left Sidebar Filters (Fixed to left) */}
        <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 py-8 px-4 ml-8 h-screen overflow-y-auto pb-32">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Filters</h3>

              {/* College Listbox */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">College</label>
                <Listbox value={college} onChange={handleCollegeChange}>
                  <ListboxButton className="w-full flex justify-between items-center py-2 px-3 text-left text-sm text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors data-open:bg-gray-50">
                    {college || "All Colleges"}
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-1 z-10"
                  >
                    <ListboxOption value="" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                      All Colleges
                    </ListboxOption>
                    {collegeOptions.map((col) => (
                      <ListboxOption key={col} value={col} className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                        {col}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Listbox>
              </div>

              {/* Department Listbox */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                <Listbox value={department} onChange={setDepartment}>
                  <ListboxButton className="w-full flex justify-between items-center py-2 px-3 text-left text-sm text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors data-open:bg-gray-50">
                    {department || "All Departments"}
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-1 z-10"
                  >
                    <ListboxOption value="" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                      All Departments
                    </ListboxOption>
                    {departmentOptions.map((dept) => (
                      <ListboxOption key={dept} value={dept} className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                        {dept}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Listbox>
              </div>

              {/* Sort Field + Direction */}
              <div className="border-t border-gray-200 pt-4 mb-4 space-y-3">
                <Listbox value={sortField} onChange={setSortField}>
                  <ListboxButton className="w-full flex justify-between items-center py-2 px-3 text-left text-sm text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors data-open:bg-gray-50">
                    {sortField ? (sortField === "code" ? "Code" : "Credits") : "Sort by..."}
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-1 z-10"
                  >
                    <ListboxOption value="" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                      None
                    </ListboxOption>
                    <ListboxOption value="code" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                      Code
                    </ListboxOption>
                    <ListboxOption value="credits" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                      Credits
                    </ListboxOption>
                  </ListboxOptions>
                </Listbox>

                {sortField && (
                  <Listbox value={sortDirection} onChange={setSortDirection}>
                    <ListboxButton className="w-full flex justify-between items-center py-2 px-3 text-left text-sm text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors data-open:bg-gray-50">
                      {sortDirection === "asc" ? "↑ Ascending" : "↓ Descending"}
                      <span className="text-lg">▼</span>
                    </ListboxButton>
                    <ListboxOptions
                      anchor="bottom"
                      transition
                      className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-1 z-10"
                    >
                      <ListboxOption value="asc" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                        ↑ Ascending
                      </ListboxOption>
                      <ListboxOption value="desc" className="px-3 py-2 text-sm text-gray-900 rounded transition-colors data-focus:bg-blue-50 cursor-pointer">
                        ↓ Descending
                      </ListboxOption>
                    </ListboxOptions>
                  </Listbox>
                )}
              </div>

              {/* Credits Range Slider */}
              <div className="border-t border-gray-200 pt-4 mb-4 relative">
                <Listbox value="" onChange={() => {}}>
                  <ListboxButton className="w-full flex justify-between items-center py-3 px-3 text-left font-semibold text-gray-800 hover:bg-gray-100 rounded-lg transition-colors data-open:bg-gray-100">
                    <span className="text-sm">Credits: {creditsRange[0]}-{creditsRange[1] === 6 ? "6+" : creditsRange[1]}</span>
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-4 z-10"
                  >
                    <div className="pointer-events-auto w-48">
                      <div className="text-sm text-gray-600 text-center font-medium mb-3">
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

              {/* Course Level Range Slider */}
              <div className="border-t border-gray-200 pt-4 relative">
                <Listbox value="" onChange={() => {}}>
                  <ListboxButton className="w-full flex justify-between items-center py-3 px-3 text-left font-semibold text-gray-800 hover:bg-gray-100 rounded-lg transition-colors data-open:bg-gray-100">
                    <span className="text-sm">Level: {courseLevelRange[0]}-{courseLevelRange[1] === 600 ? "600+" : courseLevelRange[1]}</span>
                    <span className="text-lg">▼</span>
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    transition
                    className="origin-top transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 rounded-lg border border-gray-200 bg-white shadow-lg p-4 z-10"
                  >
                    <div className="pointer-events-auto w-48">
                      <div className="text-sm text-gray-600 text-center font-medium mb-3">
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
            </div>
          </div>

        {/* Right Content: Course List */}
        <div className="flex-1 mx-auto max-w-4xl px-4 py-8">
            <p className="text-sm text-gray-400 mb-4">
              {loading ? "Loading..." : `${filteredCourses.length} course${filteredCourses.length !== 1 ? "s" : ""} found`}
            </p>

            <div className="flex flex-col gap-4">
              {loading ? (
                <p className="text-center text-gray-400 py-16">Loading courses...</p>
              ) : filteredCourses.length === 0 ? (
                <p className="text-center text-gray-400 py-16">No courses match your search.</p>
              ) : (
                filteredCourses.map((course) => (
                  <CourseSummaryCard key={course.id} course={course} />
                ))
              )}
            </div>
        </div>
      </div>
    </div>
  );
}


