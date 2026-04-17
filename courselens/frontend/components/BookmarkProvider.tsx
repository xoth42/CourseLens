"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type BookmarkContextValue = {
  user: User | null;
  bookmarkedIds: ReadonlySet<number>;
  loading: boolean;
  isBookmarked: (courseId: number) => boolean;
  toggleBookmark: (courseId: number) => Promise<{ error?: string }>;
};

const BookmarkContext = createContext<BookmarkContextValue | null>(null);

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user: nextUser },
    } = await supabase.auth.getUser();
    setUser(nextUser ?? null);

    if (!nextUser) {
      setBookmarkedIds(new Set());
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("course_bookmarks")
      .select("course_id")
      .eq("user_id", nextUser.id);

    if (error) {
      setBookmarkedIds(new Set());
      setLoading(false);
      return;
    }

    setBookmarkedIds(
      new Set((data ?? []).map((row) => Number((row as { course_id: number }).course_id)))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const isBookmarked = useCallback(
    (courseId: number) => bookmarkedIds.has(courseId),
    [bookmarkedIds]
  );

  const toggleBookmark = useCallback(
    async (courseId: number) => {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!u) return { error: "not_authenticated" };

      const has = bookmarkedIds.has(courseId);
      if (has) {
        const { error } = await supabase
          .from("course_bookmarks")
          .delete()
          .eq("user_id", u.id)
          .eq("course_id", courseId);
        if (error) return { error: error.message };
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
      } else {
        const { error } = await supabase.from("course_bookmarks").insert({
          user_id: u.id,
          course_id: courseId,
        });
        if (error) {
          if (error.code === "23505") {
            setBookmarkedIds((prev) => new Set(prev).add(courseId));
            return {};
          }
          return { error: error.message };
        }
        setBookmarkedIds((prev) => new Set(prev).add(courseId));
      }
      return {};
    },
    [bookmarkedIds]
  );

  const value = useMemo<BookmarkContextValue>(
    () => ({
      user,
      bookmarkedIds,
      loading,
      isBookmarked,
      toggleBookmark,
    }),
    [user, bookmarkedIds, loading, isBookmarked, toggleBookmark]
  );

  return <BookmarkContext.Provider value={value}>{children}</BookmarkContext.Provider>;
}

export function useBookmarks() {
  const ctx = useContext(BookmarkContext);
  if (!ctx) {
    throw new Error("useBookmarks must be used within BookmarkProvider");
  }
  return ctx;
}
