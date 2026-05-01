"use client";

<<<<<<< HEAD
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
=======
>>>>>>> d92c060 (added filtering methods)
import CourseSummaryCard, { type CourseListItem } from "@/components/CourseSummaryCard";
import RequestCourseModal from "@/components/RequestCourseModal";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type Course = CourseListItem & {
  id: number;
  code: string;
  name: string;
  professor: string;
  rating: number;
  difficulty: number;
  avg_gpa: number;
  reviews: number;
  department: string;
  college: string | null;
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

let lastSort: "" | "a-z" | "code-asc" | "code-desc" | "z-a" | "rating-asc" | "rating-desc" | "diff-asc" | "diff-desc" | "gpa-asc" | "gpa-desc" = "a-z";

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
  const [courseLevels, setCourseLevels] = useState<Set<number>>(new Set());
  const [courseLevelsOpen, setCourseLevelsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"" | "code-asc" | "code-desc" | "a-z" | "z-a" | "rating-asc" | "rating-desc" | "diff-asc" | "diff-desc" | "gpa-asc" | "gpa-desc">(lastSort);
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

  // Get available course levels from current courses
  const availableCourseLevels = Array.from(
    new Set(
      courses
        .map((c) => getCourseLevel(c.code))
        .filter((level): level is number => level !== null)
    )
  ).sort((a, b) => a - b);
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

  function handleCollegeChange(next: string) {
    setCollege(next);
    setDepartment("");
  }

  function hideUnrated(a: Course, b: Course, prop: string) {
    if (a[prop] === 0 && b[prop] !== 0) return 1
    if (b[prop] === 0 && a[prop] !== 0) return -1
    if (a[prop] === 0 && b[prop] === 0) return 0
    return -2;
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
      const matchesLevel =
        courseLevels.size === 0 || (courseLevel !== null && courseLevels.has(courseLevel));

      return matchesSearch && matchesCollege && matchesDepartment && matchesLevel;
    })
    .sort((a, b) => {
      if (sortBy === "code-asc") return getCourseNumber(a.code) - getCourseNumber(b.code);
      if (sortBy === "code-desc") return getCourseNumber(b.code) - getCourseNumber(a.code);
      if (sortBy === "a-z") return a.code.localeCompare(b.code);
      if (sortBy === "z-a") return b.code.localeCompare(a.code);
      const noratings = hideUnrated(a, b, 'rating');
      const nodiff = hideUnrated(a, b, 'difficulty');
      const nogpa = hideUnrated(a, b, 'avg_gpa');
      if (sortBy === "rating-asc") {
        return (noratings === -2? a.rating - b.rating: noratings);
      }
      if (sortBy === "rating-desc") {
        return (noratings === -2? b.rating - a.rating: noratings);
      }
      if (sortBy === "diff-asc") {
        return (nodiff === -2? a.difficulty - b.difficulty: nodiff);
      }
      if (sortBy === "diff-desc") {
        return (nodiff === -2? b.difficulty - a.difficulty: nodiff);
      }
      if (sortBy === "gpa-asc") {
        return (nogpa === -2? a.avg_gpa - b.avg_gpa: nogpa);
      }
      if (sortBy === "gpa-desc") {
        return (nogpa === -2? b.avg_gpa - a.avg_gpa: nogpa);
      }
      if (!search.trim()) return 0;
      return scoreMatch(b, searchTerms) - scoreMatch(a, searchTerms);
    })

  function toggleCourseLevel(level: number) {
    const newLevels = new Set(courseLevels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    setCourseLevels(newLevels);
  }

  function getLevelLabel(level: number): string {
    if (level === 600) return "600+";
    return `${level}`;
  }

  function buttonText(sort) {
    let azButton;
    let codeButton;
    let ratingButton;
    let diffButton;
    let gpaButton;
    if (sort === 'a-z' || sort === 'z-a'){
      sort === 'a-z' ? azButton = 'A-Z ↑' : azButton = 'A-Z ↓'
      return azButton;
    }
    if (sort === 'code-asc' || sort === 'code-desc'){
      sort === 'code-asc' ? codeButton = 'Code ↑' : codeButton = 'Code ↓'
      return codeButton;
    }
    if (sort === 'rating-asc' || sort === 'rating-desc'){
      sort === 'rating-asc' ? ratingButton = 'Rating ↑' : ratingButton = 'Rating ↓'
      return ratingButton;
    }
    if (sort === 'diff-asc' || sort === 'diff-desc'){
      sort === 'diff-asc' ? diffButton = 'Difficulty ↑' : diffButton = 'Difficulty ↓'
      return diffButton;
    }
    if (sort === 'gpa-asc' || sort === 'gpa-desc'){
      sort === 'gpa-asc' ? gpaButton = 'Avg Grade ↑' : gpaButton = 'Avg Grade ↓'
      return gpaButton;
    }
    return 
  }

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

        <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, code, or professor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={college}
            onChange={(e) => handleCollegeChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none hover:border-gray-400"
          >
            <option value="">Select College</option>
            {collegeOptions.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none hover:border-gray-400"
          >
            <option value="">Select Department</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-500 font-medium">Sort:</span>
          <button
            onClick={() => {
              setSortBy(sortBy === "a-z" ? "z-a" : "a-z");
              lastSort = (sortBy === "a-z" ? "z-a" : "a-z");
            }}
            className={`px-3 py-1.5 text-sm font-medium border rounded transition-colors ${
              (sortBy === "a-z" || sortBy === "z-a")
                ? "bg-blue-600 text-white border-blue-600 hover:border-blue-400"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
            }`}
          >
            {sortBy === "a-z" || sortBy === "z-a"? buttonText(sortBy): 'A-Z'}
          </button>
          <button
            onClick={() => {
              setSortBy(sortBy === "code-asc" ? "code-desc" : "code-asc");
              lastSort = (sortBy === "code-asc" ? "code-desc" : "code-asc")
            }}
            className={`px-3 py-1.5 text-sm font-medium border rounded transition-colors ${
              (sortBy === "code-asc" || sortBy === "code-desc")
                ? "bg-blue-600 text-white border-blue-600 hover:border-blue-400"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
            }`}
          >
            {sortBy === "code-asc" || sortBy === "code-desc"? buttonText(sortBy): 'Code'}
          </button>
          <button
                  onClick={() => {
                    setSortBy(sortBy === "rating-asc" ? "rating-desc" : "rating-asc");
                    lastSort = (sortBy === "rating-asc" ? "rating-desc" : "rating-asc")
                  }}
                  className={`px-3 py-1.5 text-sm font-medium border rounded transition-colors ${
                    (sortBy === "rating-asc" || sortBy === "rating-desc")
                      ? "bg-blue-600 text-white border-blue-600 hover:border-blue-400"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {sortBy === "rating-asc" || sortBy === "rating-desc"? buttonText(sortBy): 'Rating'}
                </button>
                <button
                  onClick={() => {
                    setSortBy(sortBy === "diff-asc" ? "diff-desc" : "diff-asc");
                    lastSort = (sortBy === "diff-asc" ? "diff-desc" : "diff-asc")
                  }}
                  className={`px-3 py-1.5 text-sm font-medium border rounded transition-colors ${
                    (sortBy === "diff-asc" || sortBy === "diff-desc")
                      ? "bg-blue-600 text-white border-blue-600 hover:border-blue-400"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {sortBy === "diff-asc" || sortBy === "diff-desc"? buttonText(sortBy): 'Difficulty'}
                </button>
                <button
                  onClick={() => {
                    setSortBy(sortBy === "gpa-asc" ? "gpa-desc" : "gpa-asc");
                    lastSort = (sortBy === "gpa-asc" ? "gpa-desc" : "gpa-asc")
                  }}
                  className={`px-3 py-1.5 text-sm font-medium border rounded transition-colors ${
                    (sortBy === "gpa-asc" || sortBy === "gpa-desc")
                      ? "bg-blue-600 text-white border-blue-600 hover:border-blue-400"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {sortBy === "gpa-asc" || sortBy === "gpa-desc"? buttonText(sortBy): 'Avg Grade'}
                </button>
        </div>

        {/* Course Level Filter Section */}
        <div className="border-b border-gray-200 mb-4">
          <button
            onClick={() => setCourseLevelsOpen(!courseLevelsOpen)}
            className="w-full flex justify-between items-center py-3 px-0 text-left font-semibold text-gray-800 hover:text-gray-600 transition-colors"
          >
            <span>Course Level</span>
            <span className="text-xl">{courseLevelsOpen ? "−" : "+"}</span>
          </button>
          {courseLevelsOpen && (
            <div className="pb-3 flex flex-wrap gap-2">
              {availableCourseLevels.map((level) => (
                <button
                  key={level}
                  onClick={() => toggleCourseLevel(level)}
                  className={`px-3 py-2 text-sm font-medium border rounded transition-colors ${
                    courseLevels.has(level)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {getLevelLabel(level)}
                </button>
              ))}
            </div>
          )}
        </div>
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
      </main>
    </div>
  );
}
