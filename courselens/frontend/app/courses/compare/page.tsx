import CourseCompareView from "@/components/CourseCompareView";

type ComparePageProps = {
  searchParams?: Promise<{ ids?: string }>;
};

export default async function CourseComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const selectedIds = (params?.ids ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  return <CourseCompareView initialSelectedIds={selectedIds} />;
}
