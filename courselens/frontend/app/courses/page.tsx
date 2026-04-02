"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase/client";
import type { Course } from "../../types/course";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [professor, setProfessor] = useState("All");
  const [filterType, setFilterType] = useState<"department" | "professor">("department");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase.from("courses").select("*");
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">CourseLens</h1>
        <p className="text-sm text-gray-500">Find and review UMass courses</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Browse Courses</h2>

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
              <CourseCard key={course.id} course={course} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/courses/${course.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              {course.code}
            </span>
            <h3 className="text-lg font-semibold text-gray-900 mt-2">{course.name}</h3>
            <p className="text-sm text-gray-500">{course.professor}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{course.rating.toFixed(1)}</div>
            <div className="text-xs text-gray-400">/ 5.0</div>
          </div>
        </div>
        <div className="flex gap-6 mt-4 text-sm text-gray-500">
          <span>Difficulty: <strong>{course.difficulty.toFixed(1)}/5</strong></span>
          <span>{course.reviews} reviews</span>
          <span>{course.department}</span>
        </div>
      </div>
    </Link>
  );
}
