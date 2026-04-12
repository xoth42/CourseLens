"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Course } from "@/types/course";

export default function EvaluateCoursePage() {
  const { id } = useParams();
  const router = useRouter();
  const courseId = Number(id);

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [studentProfileId, setStudentProfileId] = useState<number | null>(null);

  const [rating, setRating] = useState(4);
  const [difficulty, setDifficulty] = useState(3);
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [profileSetupError, setProfileSetupError] = useState<string | null>(null);

  const redirectToLogin = `/login?redirect=${encodeURIComponent(`/courses/${courseId}/evaluate`)}`;

  useEffect(() => {
    if (!Number.isFinite(courseId)) {
      setLoading(false);
      return;
    }

    async function load() {
      const { data: courseRow, error: courseError } = await supabase
        .from("course_metrics")
        .select("*")
        .eq("id", courseId)
        .single();

      if (!courseError && courseRow) setCourse(courseRow as Course);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      setSessionUser(user);

      if (!user) {
        setStudentProfileId(null);
        setProfileSetupError(null);
        setLoading(false);
        return;
      }

      setProfileSetupError(null);
      let profileId: number | null = null;
      const { data: profile } = await supabase
        .from("student_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.id != null) {
        profileId = Number(profile.id);
      } else {
        const { data: upserted, error: upsertError } = await supabase
          .from("student_profiles")
          .upsert(
            { user_id: user.id, email: user.email ?? null },
            { onConflict: "user_id" }
          )
          .select("id")
          .single();

        if (upsertError) {
          setProfileSetupError(upsertError.message);
        } else if (upserted?.id != null) {
          profileId = Number(upserted.id);
        }
      }

      setStudentProfileId(profileId);

      if (profileId) {
        const { data: existing } = await supabase
          .from("course_evaluations")
          .select("id")
          .eq("course_id", courseId)
          .eq("student_profile_id", profileId)
          .maybeSingle();

        if (existing) {
          router.push(`/courses/${courseId}`);
          return;
        }
      }

      setLoading(false);
    }

    load();
  }, [courseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!studentProfileId) {
      setMessage("Could not resolve your student profile. Check that student_profiles exists and RLS allows insert.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("course_evaluations").insert({
      course_id: courseId,
      student_profile_id: studentProfileId,
      rating,
      difficulty,
      grade: grade.trim() || null,
      semester: semester.trim() || null,
      comment: comment.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        setMessage("You already submitted an evaluation for this course.");
      } else {
        setMessage(error.message);
      }
      return;
    }

    router.push(`/courses/${courseId}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-500 text-center">Course not found.</p>
      </div>
    );
  }

  if (sessionUser && studentProfileId === null) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md text-center shadow-sm">
          <p className="text-gray-800 mb-2">Could not create your student profile.</p>
          {profileSetupError && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-left text-xs text-red-800">{profileSetupError}</p>
          )}
          <p className="text-sm text-gray-500 mb-4">
            In Supabase → SQL → run the full script in{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">data_management/supabase_course_evaluations.sql</code>{" "}
            (it drops the <code className="text-xs bg-gray-100 px-1">auth.users</code> foreign key, adds grants, and fixes RLS). Then refresh this page.
          </p>
          <Link href={`/courses/${courseId}`} className="text-blue-600 text-sm hover:underline">
            Back to course
          </Link>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <p className="text-xs font-semibold text-blue-700 bg-blue-100 inline-block px-2 py-1 rounded-full">{course.code}</p>
          <p className="text-lg font-semibold text-gray-900 mt-2">{course.name}</p>
          <p className="text-gray-800 mt-4 mb-4">Sign in to add an evaluation for this course.</p>
          <Link
            href={redirectToLogin}
            className="inline-block bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex-1 bg-gray-50">
      <main className="mx-auto max-w-xl px-4 py-8">
        <Link href={`/courses/${courseId}`} className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to course
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-xs font-semibold text-blue-700 bg-blue-100 inline-block px-2 py-1 rounded-full">{course.code}</p>
          <h2 className="text-xl font-bold text-gray-900 mt-2">{course.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Submitting as student ID <span className="font-mono text-gray-700">{studentProfileId}</span>
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overall rating (1–5)</label>
              <input
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-600 mt-1">{rating.toFixed(1)} / 5</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty (1–5)</label>
              <input
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-sm text-gray-600 mt-1">{difficulty.toFixed(1)} / 5</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade (optional)</label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. A-"
                maxLength={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester (optional)</label>
              <input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="e.g. Fall 2025"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>

            {message && <p className="text-sm text-red-600">{message}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit evaluation"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
