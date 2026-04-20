import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-50">
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Welcome to CourseLens
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Find and review UMass courses.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/courses"
            className="inline-flex rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Browse courses
          </Link>
          <Link
            href="/login"
            className="inline-flex rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
