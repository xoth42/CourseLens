"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase/client";
import type { Course, Review } from "../../../types/course";

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from("course_metrics")
        .select("*")
        .eq("id", Number(id))
        .single();
      if (!error && data) setCourse(data);

      const { data: reviewData } = await supabase
        .from("course_evaluations")
        .select("id, rating, difficulty, grade, semester, professor_name, hours_per_week, comment, created_at")
        .eq("course_id", Number(id))
        .order("created_at", { ascending: false });
      if (reviewData) setReviews(reviewData);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (user) {
        const { data: profile } = await supabase
          .from("student_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.id) {
          const { data: existing } = await supabase
            .from("course_evaluations")
            .select("id")
            .eq("course_id", Number(id))
            .eq("student_profile_id", profile.id)
            .maybeSingle();
          if (existing) setAlreadyReviewed(true);
        }
      }

      setLoading(false);
    }
    fetchData();
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

          <div className="mb-6 relative">
            <button
              onClick={() => alreadyReviewed ? setShowPopup(true) : window.location.href = `/courses/${course.id}/evaluate`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Write a review
            </button>
            {showPopup && (
              <div className="absolute top-12 left-0 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10 w-64">
                <p className="text-sm text-gray-800 font-medium">You already reviewed this course.</p>
                <p className="text-xs text-gray-500 mt-1">Only one review per course is allowed.</p>
                <button
                  onClick={() => setShowPopup(false)}
                  className="mt-3 text-xs text-blue-600 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
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
              <div className="text-sm text-gray-500">Avg. Grade</div>
            </div>
          </div>
        </div>

        {/* Reviews section */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {reviews.length} Review{reviews.length !== 1 ? "s" : ""}
          </h3>
          {reviews.length === 0 ? (
            <p className="text-gray-400 text-sm">No reviews yet. Be the first!</p>
          ) : (
            <div className="flex flex-col gap-4">
              {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-start mb-3">
        <span className="text-sm font-medium text-gray-700">Anonymous Student</span>
        {review.semester && (
          <span className="text-xs text-gray-400">{review.semester}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-3 text-sm">
        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
          Rating: {review.rating.toFixed(1)} / 5
        </span>
        <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-md">
          Difficulty: {review.difficulty.toFixed(1)} / 5
        </span>
        {review.grade && (
          <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md">
            Grade: {review.grade}
          </span>
        )}
        {review.hours_per_week && (
          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md">
            {review.hours_per_week} hrs/week
          </span>
        )}
        {review.professor_name && (
          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-md">
            {review.professor_name}
          </span>
        )}
      </div>

      {review.comment && (
        <p className="text-sm text-gray-600 border-l-2 border-gray-200 pl-3 italic">
          "{review.comment}"
        </p>
      )}
    </div>
  );
}
