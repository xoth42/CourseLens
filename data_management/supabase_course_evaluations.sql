-- Run in Supabase SQL editor after your public.courses table exists.
-- Links Supabase Auth users to an integer "student id" and stores one evaluation per user per course.
--
-- If you already ran an older version and profile INSERT still fails: the FK to auth.users is often
-- the cause. This script drops that constraint and ensures GRANTs + RLS policies exist.

-- 1) Tables (no FK to auth.users — RLS enforces user_id = auth.uid())
CREATE TABLE IF NOT EXISTS public.student_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_evaluations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id integer NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  student_profile_id bigint NOT NULL REFERENCES public.student_profiles (id) ON DELETE CASCADE,
  rating real NOT NULL CHECK (rating >= 1 AND rating <= 5),
  difficulty real NOT NULL CHECK (difficulty >= 1 AND difficulty <= 5),
  grade varchar(3),
  semester text,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (course_id, student_profile_id)
);

-- 2) Remove auth.users FK if a previous run added it (breaks client inserts without auth schema grants)
ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_user_id_fkey;

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_evaluations ENABLE ROW LEVEL SECURITY;

-- 3) Idempotent policies
DROP POLICY IF EXISTS "student_profiles_select_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_insert_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_update_own" ON public.student_profiles;
DROP POLICY IF EXISTS "course_evaluations_select_authenticated" ON public.course_evaluations;
DROP POLICY IF EXISTS "course_evaluations_insert_own_profile" ON public.course_evaluations;

CREATE POLICY "student_profiles_select_own"
  ON public.student_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "student_profiles_insert_own"
  ON public.student_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "student_profiles_update_own"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "course_evaluations_select_authenticated"
  ON public.course_evaluations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "course_evaluations_insert_own_profile"
  ON public.course_evaluations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_profile_id AND sp.user_id = auth.uid()
    )
  );

-- 4) Table privileges (RLS still applies)
GRANT SELECT, INSERT, UPDATE ON public.student_profiles TO authenticated;
GRANT SELECT, INSERT ON public.course_evaluations TO authenticated;
GRANT ALL ON public.student_profiles TO service_role;
GRANT ALL ON public.course_evaluations TO service_role;
