"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import BookmarkButton from "@/components/BookmarkButton";
import { gpaToLetter } from "@/lib/gpa";
import { supabase } from "../../../lib/supabase/client";
import type { Course, Review, Reply } from "../../../types/course";

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<number | null>(null);
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
        .select("id, student_profile_id, rating, difficulty, grade, semester, professor_name, hours_per_week, comment, created_at")
        .eq("course_id", Number(id))
        .order("created_at", { ascending: false });
      if (reviewData) {
        setReviews(reviewData);
        if (reviewData.length > 0) {
          const reviewIds = reviewData.map((r: Review) => r.id);
          const { data: replyData } = await supabase
            .from("review_replies")
            .select("id, review_id, student_profile_id, parent_reply_id, content, created_at")
            .in("review_id", reviewIds)
            .order("created_at", { ascending: true });
          if (replyData) setReplies(replyData);
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (user) {
        const { data: profile } = await supabase
          .from("student_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.id) {
          setCurrentProfileId(profile.id);
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

  async function handleReplySubmit(reviewId: number, content: string, parentReplyId?: number) {
    if (!currentProfileId) return;
    const { data } = await supabase
      .from("review_replies")
      .insert({ review_id: reviewId, student_profile_id: currentProfileId, content, parent_reply_id: parentReplyId ?? null })
      .select()
      .single();
    if (data) setReplies((prev) => [...prev, data]);
  }

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
              {reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  replies={replies.filter((rep) => rep.review_id === r.id)}
                  currentProfileId={currentProfileId}
                  onReplySubmit={handleReplySubmit}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function getLabel(authorId: number, reviewAuthorId: number, allReplies: Reply[]): string {
  if (authorId === reviewAuthorId) return "OP";
  const uniqueCommenters: number[] = [];
  for (const r of allReplies) {
    if (r.student_profile_id !== reviewAuthorId && !uniqueCommenters.includes(r.student_profile_id)) {
      uniqueCommenters.push(r.student_profile_id);
    }
  }
  const idx = uniqueCommenters.indexOf(authorId);
  return idx === -1 ? "?" : `#${idx + 1}`;
}

type ReplyNode = Reply & { children: ReplyNode[] };

function buildTree(flat: Reply[]): ReplyNode[] {
  const map = new Map<number, ReplyNode>();
  flat.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: ReplyNode[] = [];
  flat.forEach((r) => {
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children.push(map.get(r.id)!);
    } else {
      roots.push(map.get(r.id)!);
    }
  });
  return roots;
}

function ReplyItem({
  node,
  depth,
  reviewAuthorId,
  allReplies,
  currentProfileId,
  replyingTo,
  replyText,
  submitting,
  setReplyingTo,
  setReplyText,
  onSubmit,
}: {
  node: ReplyNode;
  depth: number;
  reviewAuthorId: number;
  allReplies: Reply[];
  currentProfileId: number | null;
  replyingTo: number | null;
  replyText: string;
  submitting: boolean;
  setReplyingTo: (id: number | null) => void;
  setReplyText: (t: string) => void;
  onSubmit: (parentId: number) => void;
}) {
  const label = getLabel(node.student_profile_id, reviewAuthorId, allReplies);
  const isOP = label === "OP";
  const isReplying = replyingTo === node.id;
  return (
    <div className={depth > 0 ? "ml-5 border-l border-gray-100 pl-3" : ""}>
      <div className="flex gap-2 items-start">
        <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${isOP ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
          {label}
        </span>
        <div className="flex-1">
          <p className="text-sm text-gray-700">{node.content}</p>
          {currentProfileId && (
            <button
              onClick={() => setReplyingTo(isReplying ? null : node.id)}
              className="text-xs text-blue-700 hover:underline mt-1"
            >
              {isReplying ? "Cancel" : "Reply"}
            </button>
          )}
          {isReplying && (
            <div className="flex gap-2 items-end mt-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
                className="flex-1 text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-500"
              />
              <button
                onClick={() => onSubmit(node.id)}
                disabled={submitting || !replyText.trim()}
                className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}
        </div>
      </div>
      {node.children.map((child) => (
        <ReplyItem
          key={child.id}
          node={child}
          depth={depth + 1}
          reviewAuthorId={reviewAuthorId}
          allReplies={allReplies}
          currentProfileId={currentProfileId}
          replyingTo={replyingTo}
          replyText={replyText}
          submitting={submitting}
          setReplyingTo={setReplyingTo}
          setReplyText={setReplyText}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  replies,
  currentProfileId,
  onReplySubmit,
}: {
  review: Review;
  replies: Reply[];
  currentProfileId: number | null;
  onReplySubmit: (reviewId: number, content: string, parentReplyId?: number) => Promise<void>;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [showTopReplyInput, setShowTopReplyInput] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null); // reply id for nested replies

  async function handleSubmit(parentReplyId?: number) {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    await onReplySubmit(review.id, trimmed, parentReplyId);
    setReplyText("");
    setReplyingTo(null);
    setSubmitting(false);
  }


  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {review.semester && (
        <div className="flex justify-end mb-3">
          <span className="text-xs text-gray-400">{review.semester}</span>
        </div>
      )}

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

      {/* Replies toggle */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => setShowReplies((v) => !v)}
          className="text-xs font-medium text-blue-700 hover:underline"
        >
          {showReplies ? "Hide replies" : "View replies"} · {replies.length}
        </button>
        {currentProfileId && (
          <button
            onClick={() => { setShowTopReplyInput((v) => !v); setReplyingTo(null); }}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
          >
            Reply
          </button>
        )}
      </div>

      {/* Top-level reply input */}
      {showTopReplyInput && replyingTo === null && (
        <div className="flex gap-2 items-end mt-3">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            rows={2}
            className="flex-1 text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-500"
          />
          <button
            onClick={() => handleSubmit(undefined)}
            disabled={submitting || !replyText.trim()}
            className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Reply
          </button>
        </div>
      )}

      {/* Existing replies */}
      {showReplies && (
        <div className="mt-3 flex flex-col gap-3">
          {replies.length === 0 && (
            <p className="text-xs text-gray-400">No replies yet.</p>
          )}
          {buildTree(replies).map((node) => (
            <ReplyItem
              key={node.id}
              node={node}
              depth={0}
              reviewAuthorId={review.student_profile_id}
              allReplies={replies}
              currentProfileId={currentProfileId}
              replyingTo={replyingTo}
              replyText={replyText}
              submitting={submitting}
              setReplyingTo={setReplyingTo}
              setReplyText={setReplyText}
              onSubmit={(parentId) => handleSubmit(parentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
