"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBookmarks } from "./BookmarkProvider";

type BookmarkButtonProps = {
  courseId: number;
  className?: string;
};

export default function BookmarkButton({ courseId, className = "" }: BookmarkButtonProps) {
  const pathname = usePathname();
  const { user, loading, isBookmarked, toggleBookmark } = useBookmarks();
  const [pending, setPending] = useState(false);

  const saved = isBookmarked(courseId);
  const redirect = encodeURIComponent(pathname || "/courses");

  if (!loading && !user) {
    return (
      <Link
        href={`/login?redirect=${redirect}`}
        className={`inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-blue-600 ${className}`}
        title="Sign in to save courses"
        aria-label="Sign in to save courses"
      >
        <BookmarkIcon filled={false} />
      </Link>
    );
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending || loading) return;
    setPending(true);
    await toggleBookmark(courseId);
    setPending(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || loading}
      className={`inline-flex items-center justify-center rounded-lg border p-2 shadow-sm transition-colors disabled:opacity-50 ${
        saved
          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-amber-600"
      } ${className}`}
      title={saved ? "Remove from saved" : "Save course"}
      aria-label={saved ? "Remove from saved" : "Save course"}
      aria-pressed={saved}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}
