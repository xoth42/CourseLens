"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import CourseSummaryCard, { type CourseListItem } from "@/components/CourseSummaryCard";
import RequestCourseModal from "@/components/RequestCourseModal";

type Course = CourseListItem;

const MOCK_COURSES: Course[] = [
  { id: 1, code: "CS 320",   name: "Software Engineering",       professor: "Dr. Lehr",       rating: 4.1, difficulty: 3.2, reviews: 45, department: "Computer Science" },
  { id: 2, code: "CS 311",   name: "Algorithms",                 professor: "Dr. Barrington", rating: 3.8, difficulty: 4.5, reviews: 62, department: "Computer Science" },
  { id: 3, code: "CS 230",   name: "Computer Systems",           professor: "Dr. Croft",      rating: 4.3, difficulty: 4.0, reviews: 38, department: "Computer Science" },
  { id: 4, code: "MATH 235", name: "Linear Algebra",             professor: "Dr. Havens",     rating: 4.0, difficulty: 3.8, reviews: 55, department: "Mathematics" },
  { id: 5, code: "CS 326",   name: "Web Programming",            professor: "Dr. Richards",   rating: 4.5, difficulty: 2.8, reviews: 71, department: "Computer Science" },
  { id: 6, code: "MATH 331", name: "Ordinary Differential Eqs.", professor: "Dr. Pedit",      rating: 3.6, difficulty: 4.2, reviews: 29, department: "Mathematics" },
];

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [professor, setProfessor] = useState("All");
  const [filterType, setFilterType] = useState<"department" | "professor">("department");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase.from("course_metrics").select("*");
      if (!error && data) setCourses(data);
      setLoading(false);
    }
    fetchCourses();
  }, []);

  const departments = ["All", ...new Set(courses.map((c) => c.department))];
  const professors = ["All", ...new Set(courses.map((c) => c.professor))];

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.name.toLowerCase().includes(search.toLowerCase()) ||
      course.code.toLowerCase().includes(search.toLowerCase()) ||
      course.professor.toLowerCase().includes(search.toLowerCase());

    const matchesDepartment = filterType !== "department" || department === "All" || course.department === department;
    const matchesProfessor = filterType !== "professor" || professor === "All" || course.professor === professor;

    return matchesSearch && matchesDepartment && matchesProfessor;
  });

  const filterLabel = filterType === "professor" ? "Professor" : "Department";

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

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, code, or professor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {filterLabel} ▾
            </button>

            {showFilterMenu && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3 w-52">
                <p className="text-xs text-gray-700 mb-2 font-medium">Filter by</p>
                <button
                  onClick={() => { setFilterType("department"); setShowFilterMenu(false); }}
                  className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100 text-gray-800"
                >
                  Department
                </button>
                <button
                  onClick={() => { setFilterType("professor"); setShowFilterMenu(false); }}
                  className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-100 text-gray-800"
                >
                  Professor
                </button>
              </div>
            )}
          </div>

          {filterType === "department" && (
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          )}

          {filterType === "professor" && (
            <select
              value={professor}
              onChange={(e) => setProfessor(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none"
            >
              {professors.map((prof) => (
                <option key={prof} value={prof}>{prof}</option>
              ))}
            </select>
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
