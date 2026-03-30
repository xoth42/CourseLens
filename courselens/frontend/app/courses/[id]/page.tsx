"use client";

import { useParams } from "next/navigation";
import Link from "next/link";

type Course = {
  id: number;
  code: string;
  name: string;
  professor: string;
  rating: number;
  difficulty: number;
  reviews: number;
  department: string;
  description: string;
};

const MOCK_COURSES: Course[] = [
  { id: 1, code: "CS 320", name: "Software Engineering", professor: "Dr. Lehr", rating: 4.1, difficulty: 3.2, reviews: 45, department: "Computer Science", description: "Introduction to software engineering principles including design, testing, and project management." },
  { id: 2, code: "CS 311", name: "Algorithms", professor: "Dr. Barrington", rating: 3.8, difficulty: 4.5, reviews: 62, department: "Computer Science", description: "Study of algorithm design and analysis including sorting, graphs, and dynamic programming." },
  { id: 3, code: "CS 230", name: "Computer Systems", professor: "Dr. Croft", rating: 4.3, difficulty: 4.0, reviews: 38, department: "Computer Science", description: "Introduction to computer systems, assembly language, and memory management." },
  { id: 4, code: "MATH 235", name: "Linear Algebra", professor: "Dr. Havens", rating: 4.0, difficulty: 3.8, reviews: 55, department: "Mathematics", description: "Vectors, matrices, linear transformations, and their applications." },
  { id: 5, code: "CS 326", name: "Web Programming", professor: "Dr. Richards", rating: 4.5, difficulty: 2.8, reviews: 71, department: "Computer Science", description: "Full stack web development including HTML, CSS, JavaScript, and databases." },
  { id: 6, code: "MATH 331", name: "Ordinary Differential Eqs.", professor: "Dr. Pedit", rating: 3.6, difficulty: 4.2, reviews: 29, department: "Mathematics", description: "First and second order differential equations and their applications." },
];

export default function CourseDetailPage() {
  const { id } = useParams();
  const course = MOCK_COURSES.find((c) => c.id === Number(id));

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">CourseLens</h1>
        <p className="text-sm text-gray-500">Find and review UMass courses</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/courses" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to courses
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {course.code}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mt-2">{course.name}</h2>
              <p className="text-gray-500">
                <Link
                  href={`/professors/${encodeURIComponent(course.professor)}`}
                  className="text-blue-600 hover:underline"
                >
                  {course.professor}
                </Link>
                {" · "}
                {course.department}
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-blue-600">{course.rating.toFixed(1)}</div>
              <div className="text-xs text-gray-400">/ 5.0 rating</div>
            </div>
          </div>

          <p className="text-gray-700 mb-6">{course.description}</p>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">{course.rating.toFixed(1)}</div>
              <div className="text-sm text-gray-500">Overall Rating</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">{course.difficulty.toFixed(1)}</div>
              <div className="text-sm text-gray-500">Difficulty</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">{course.reviews}</div>
              <div className="text-sm text-gray-500">Reviews</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}