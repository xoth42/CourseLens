"use client";

import { BookmarkProvider } from "./BookmarkProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <BookmarkProvider>{children}</BookmarkProvider>;
}
