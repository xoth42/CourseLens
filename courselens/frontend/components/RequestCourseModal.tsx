"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type RequestCourseModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function RequestCourseModal({ open, onClose }: RequestCourseModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [subject, setSubject] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [className, setClassName] = useState("");
  const [description, setDescription] = useState("");
  const [professorName, setProfessorName] = useState("");
  const [credits, setCredits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(false);
      setSubject("");
      setCourseNumber("");
      setClassName("");
      setDescription("");
      setProfessorName("");
      setCredits("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const sub = subject.trim();
    const num = courseNumber.trim();
    const title = className.trim();
    const prof = professorName.trim();

    if (!sub || !num || !title || !prof) {
      setError("Subject, course number, class name, and professor are required.");
      return;
    }

    if (!user) {
      setError("Sign in to submit a request.");
      return;
    }

    const creditsVal = credits.trim();
    let creditsNum: number | null = null;
    if (creditsVal !== "") {
      const n = Number(creditsVal);
      if (!Number.isFinite(n) || n < 0) {
        setError("Credits must be a non-negative number.");
        return;
      }
      creditsNum = Math.round(n);
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from("class_add_requests").insert({
      subject: sub,
      course_number: num,
      class_name: title,
      description: description.trim() || null,
      professor_name: prof,
      credits: creditsNum,
      requested_by_user_id: user.id,
      status: "pending",
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
  };

  if (!open) return null;

  const redirectLogin = `/login?redirect=${encodeURIComponent("/courses")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Request a class</h3>
            <p className="text-sm text-gray-500 mt-1">
              Suggest a course and instructor. If approved, it can be added to the catalog (
              <code className="text-xs bg-gray-100 px-1 rounded">classes</code>,{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">professor</code>
              ).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900">
            Thanks — your request was submitted for review.
          </div>
        ) : !user ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-center">
            <p className="text-sm text-gray-700 mb-3">Sign in to request a new class listing.</p>
            <Link
              href={redirectLogin}
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. CS"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course number</label>
                <input
                  type="text"
                  value={courseNumber}
                  onChange={(e) => setCourseNumber(e.target.value)}
                  placeholder="e.g. 320"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class name</label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Official course title"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Professor</label>
              <input
                type="text"
                value={professorName}
                onChange={(e) => setProfessorName(e.target.value)}
                placeholder="Instructor name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credits (optional)</label>
              <input
                type="text"
                inputMode="numeric"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                placeholder="e.g. 3"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        )}

        {success && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
