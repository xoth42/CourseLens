"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import BookmarkButton from "@/components/BookmarkButton";
import { supabase } from "../../../lib/supabase/client";
import type { Course } from "../../../types/course";

function gpaToLetter(gpa: number): string {
  if (gpa === 0) return "N/A";
  if (gpa >= 3.85) return "A";
  if (gpa >= 3.5)  return "A-";
  if (gpa >= 3.15) return "B+";
  if (gpa >= 2.85) return "B";
  if (gpa >= 2.5)  return "B-";
  if (gpa >= 2.15) return "C+";
  if (gpa >= 1.85) return "C";
  if (gpa >= 1.5)  return "C-";
  if (gpa >= 1.15) return "D+";
  return "D";
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCourse() {
      const { data, error } = await supabase
        .from("course_metrics")
        .select("*")
        .eq("id", Number(id))
        .single();
      if (!error && data) setCourse(data);
      setLoading(false);
    }
    fetchCourse();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50">
        <p className="text-gray-500">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/courses" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to courses
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div className="min-w-0 flex-1">
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
            <div className="flex shrink-0 items-start gap-3">
              <BookmarkButton courseId={course.id} />
              <div className="text-right">
                <div className="text-4xl font-bold text-blue-600">{course.rating.toFixed(1)}</div>
                <div className="text-xs text-gray-400">/ 5.0 rating</div>
              </div>
            </div>
          </div>

          <p className="text-gray-700 mb-6">{course.description}</p>

          <div className="mb-6">
            <Link
              href={`/courses/${course.id}/evaluate`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Write a review
            </Link>
          </div>

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
            <div className="text-2xl font-bold text-gray-800">{gpaToLetter(course.avg_gpa)}</div>
             <div className="text-sm text-gray-500">Avg. GPA</div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
