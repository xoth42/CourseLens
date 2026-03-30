
"use client";

import { useState } from "react";
import Link from "next/link";

// TypeScript: define what a "Course" looks like so we don't make mistakes
type Course = {
  id: number;
  code: string;        // e.g. "CS 320"
  name: string;        // e.g. "Software Engineering"
  professor: string;
  rating: number;      // 0–5
  difficulty: number;  // 0–5
  reviews: number;     // how many reviews exist
  department: string;
};

//data for test
const MOCK_COURSES: Course[] = [
  { id: 1, code: "CS 320",  name: "Software Engineering",       professor: "Dr. Lehr",        rating: 4.1, difficulty: 3.2, reviews: 45, department: "Computer Science" },
  { id: 2, code: "CS 311",  name: "Algorithms",                 professor: "Dr. Barrington",  rating: 3.8, difficulty: 4.5, reviews: 62, department: "Computer Science" },
  { id: 3, code: "CS 230",  name: "Computer Systems",           professor: "Dr. Croft",       rating: 4.3, difficulty: 4.0, reviews: 38, department: "Computer Science" },
  { id: 4, code: "MATH 235",name: "Linear Algebra",             professor: "Dr. Havens",      rating: 4.0, difficulty: 3.8, reviews: 55, department: "Mathematics" },
  { id: 5, code: "CS 326",  name: "Web Programming",            professor: "Dr. Richards",    rating: 4.5, difficulty: 2.8, reviews: 71, department: "Computer Science" },
  { id: 6, code: "MATH 331",name: "Ordinary Differential Eqs.", professor: "Dr. Pedit",       rating: 3.6, difficulty: 4.2, reviews: 29, department: "Mathematics" },
];

export default function CoursesPage() {

  const [search, setSearch] = useState("");        //whats typed in search
  const [department, setDepartment] = useState("All"); // which filter

  //department dropdown menu
  const departments = ["All", ...new Set(MOCK_COURSES.map((c) => c.department))];

  // Filter the list every time search or department changes
  const filteredCourses = MOCK_COURSES.filter((course) => {
    const matchesSearch =
      course.name.toLowerCase().includes(search.toLowerCase()) ||
      course.code.toLowerCase().includes(search.toLowerCase()) ||
      course.professor.toLowerCase().includes(search.toLowerCase());

    const matchesDepartment =
      department === "All" || course.department === department;

    // keep if both conditions true
    return matchesSearch && matchesDepartment;
  });

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top header bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">CourseLens</h1>
        <p className="text-sm text-gray-500">Find and review UMass courses</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Browse Courses</h2>

        {/* Search bar + department filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, code, or professor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}  // update state on every keystroke
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* How many results */}
        <p className="text-sm text-gray-400 mb-4">
          {filteredCourses.length} course{filteredCourses.length !== 1 ? "s" : ""} found
        </p>

        {/* List of course cards */}
        <div className="flex flex-col gap-4">
          {filteredCourses.length === 0 ? (
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

// A small reusable component for one course card
function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/courses/${course.id}`}>
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex justify-between items-start">
        <div>
          {/* Blue badge for the course code */}
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {course.code}
          </span>
          <h3 className="text-lg font-semibold text-gray-900 mt-2">{course.name}</h3>
          <p className="text-sm text-gray-500">{course.professor}</p>
        </div>

        {/* Rating shown on the right */}
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">{course.rating.toFixed(1)}</div>
          <div className="text-xs text-gray-400">/ 5.0</div>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="flex gap-6 mt-4 text-sm text-gray-500">
        <span>Difficulty: <strong>{course.difficulty.toFixed(1)}/5</strong></span>
        <span>{course.reviews} reviews</span>
        <span>{course.department}</span>
      </div>
    </div>
    </Link>
  );
}