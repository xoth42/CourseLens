import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="block hover:opacity-80">
            <h1 className="text-2xl font-bold text-gray-900">CourseLens</h1>
            <p className="text-sm text-gray-500">Find and review UMass courses</p>
          </Link>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
          <Link href="/courses" className="text-blue-600 hover:text-blue-800">
            Browse courses
          </Link>
          <Link href="/login" className="text-blue-600 hover:text-blue-800">
            Sign in
          </Link>
          <Link href="/signup" className="text-blue-600 hover:text-blue-800">
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
