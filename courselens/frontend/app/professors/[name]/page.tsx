"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase/client";
import type { Course } from "../../../types/course";

export default function ProfessorDetailPage() {
  const { name } = useParams();
  const professorName = decodeURIComponent(name as string);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("professor", professorName);
      if (!error && data) setCourses(data);
      setLoading(false);
    }
    fetchCourses();
  }, [professorName]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Professor not found.</p>
      </div>
    );
  }

  const avgRating = courses.reduce((sum, c) => sum + c.rating, 0) / courses.length;
  const avgDifficulty = courses.reduce((sum, c) => sum + c.difficulty, 0) / courses.length;
  const totalReviews = courses.reduce((sum, c) => sum + c.reviews, 0);
  const department = courses[0].department;

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

        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900">{professorName}</h2>
            <span className="text-sm text-gray-500">{department}</span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{avgRating.toFixed(1)}</div>
              <div className="text-sm text-gray-500">Avg Rating</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">{avgDifficulty.toFixed(1)}</div>
              <div className="text-sm text-gray-500">Avg Difficulty</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">{totalReviews}</div>
              <div className="text-sm text-gray-500">Total Reviews</div>
            </div>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Courses by {professorName}
        </h3>

        <div className="flex flex-col gap-4">
          {courses.map((course) => (
            <Link href={`/courses/${course.id}`} key={course.id}>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                      {course.code}
                    </span>
                    <h4 className="text-lg font-semibold text-gray-900 mt-2">{course.name}</h4>
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
          ))}
        </div>
      </main>
    </div>
  );
}
