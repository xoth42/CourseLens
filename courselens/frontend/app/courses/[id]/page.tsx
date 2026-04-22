"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import BookmarkButton from "@/components/BookmarkButton";
import { supabase } from "../../../lib/supabase/client";
import type { Course, Review, Reply } from "../../../types/course";

function gpaToLetter(gpa: number): string {
  if (gpa === 0) return "N/A";
  if (gpa >= 3.85) return "A";
  if (gpa >= 3.5)  return "A-";
  if (gpa >= 3.15) return "B+";
  if (gpa >= 2.85) return "B";
  if (gpa >= 2.5)  return "B-";
  if (gpa >= 2.15) return "C+";
  if (gpa >= 1.85) return "C";
  if (gpa >= 1.5)  return "C-";
  if (gpa >= 1.15) return "D+";
  return "D";
}

function normalizeGrade(grade: string | null): string | null {
  if (!grade) return null;
  const cleaned = grade.trim().toUpperCase();
  const allowed = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
  return allowed.includes(cleaned) ? cleaned : null;
}

function gradeToPoints(letter: string): number {
  switch (letter) {
    case "A": return 4.0;
    case "A-": return 3.7;
    case "B+": return 3.3;
    case "B": return 3.0;
    case "B-": return 2.7;
    case "C+": return 2.3;
    case "C": return 2.0;
    case "C-": return 1.7;
    case "D+": return 1.3;
    case "D": return 1.0;
    default: return 0.0;
  }
}

function semesterSortValue(semester: string): number {
  const match = semester.match(/(Spring|Summer|Fall)\s+(\d{4})/i);
  if (!match) return 0;

  const term = match[1].toLowerCase();
  const year = Number(match[2]);

  let termValue = 0;
  if (term === "spring") termValue = 1;
  if (term === "summer") termValue = 2;
  if (term === "fall") termValue = 3;

  return year * 10 + termValue;
}

function gpaTickLabel(gpa: number): string {
  if (gpa === 4) return "4.0 (A)";
  if (gpa === 3) return "3.0 (B)";
  if (gpa === 2) return "2.0 (C)";
  if (gpa === 1) return "1.0 (D)";
  return "0.0 (F)";
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedGraph, setSelectedGraph] = useState("distribution");
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  async function fetchAiOverview() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/ai-overview?courseId=${id}`);
      const json = await res.json();
      if (json.error) console.error("AI overview error:", json.error);
      setAiOverview(json.overview ?? null);
    } catch (err) {
      console.error("fetchAiOverview failed:", err);
    }
    setAiLoading(false);
  }

  async function handleReplySubmit(reviewId: number, content: string, parentReplyId?: number) {
    if (!currentProfileId) return;
    const { data } = await supabase
      .from("review_replies")
      .insert({ review_id: reviewId, student_profile_id: currentProfileId, content, parent_reply_id: parentReplyId ?? null })
      .select()
      .single();
    if (data) setReplies((prev) => [...prev, data]);
  }

  const gradeDistribution = useMemo(() => {
    const buckets: Record<string, number> = {
      A: 0, "A-": 0, "B+": 0, B: 0, "B-": 0,
      "C+": 0, C: 0, "C-": 0, "D+": 0, D: 0, F: 0
    };
  
    reviews.forEach((r) => {
      const g = r.grade?.toUpperCase();
      if (g && buckets[g] !== undefined) buckets[g]++;
    });
  
    return buckets;
  }, [reviews]);
  
  const maxGradeCount = Math.max(...Object.values(gradeDistribution), 1);
  
  const gradeOverTime = useMemo(() => {
    const map: Record<string, number[]> = {};
  
    reviews.forEach((r) => {
      if (!r.semester || !r.grade) return;
  
      const g = normalizeGrade(r.grade);
      if (!g) return;
  
      if (!map[r.semester]) map[r.semester] = [];
      map[r.semester].push(gradeToPoints(g));
    });
  
    return Object.entries(map)
      .map(([semester, values]) => ({
        label: semester,
        value: values.reduce((a, b) => a + b, 0) / values.length,
      }))
      .sort((a, b) => semesterSortValue(a.label) - semesterSortValue(b.label));
  }, [reviews]);
  
  const gradeByInstructor = useMemo(() => {
    const map: Record<string, number[]> = {};
  
    reviews.forEach((r) => {
      if (!r.professor_name || !r.grade) return;
  
      const g = normalizeGrade(r.grade);
      if (!g) return;
  
      if (!map[r.professor_name]) map[r.professor_name] = [];
      map[r.professor_name].push(gradeToPoints(g));
    });
  
    return Object.entries(map).map(([prof, values]) => ({
      label: prof,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }));
  }, [reviews]);
  
  const hoursBuckets = useMemo(() => {
    const buckets = {
      "0-5": 0,
      "6-10": 0,
      "11-15": 0,
      "16-20": 0,
      "21+": 0,
    };
  
    reviews.forEach((r) => {
      const h = r.hours_per_week;
      if (!h) return;
  
      if (h <= 5) buckets["0-5"]++;
      else if (h <= 10) buckets["6-10"]++;
      else if (h <= 15) buckets["11-15"]++;
      else if (h <= 20) buckets["16-20"]++;
      else buckets["21+"]++;
    });
  
    return Object.entries(buckets).map(([label, value]) => ({
      label,
      value,
    }));
  }, [reviews]);
  
  const maxHoursCount = Math.max(...hoursBuckets.map((b) => b.value), 1);
  
  const difficultyGrade = useMemo(() => {
    const map: Record<string, number[]> = {};
  
    reviews.forEach((r) => {
      if (!r.grade) return;
  
      const g = normalizeGrade(r.grade);
      if (!g) return;
  
      const key = Math.round(r.difficulty).toString();
  
      if (!map[key]) map[key] = [];
      map[key].push(gradeToPoints(g));
    });
  
    return Object.entries(map).map(([diff, values]) => ({
      label: diff,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }));
  }, [reviews]);

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
        <div className="mt-10 bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-800">Course Analytics</h3>

            <select
              value={selectedGraph}
              onChange={(e) => setSelectedGraph(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            >
              <option value="distribution">Grade Distribution</option>
              <option value="over-time">Grade Over Time</option>
              <option value="per-instructor">Grade per Instructor</option>
              <option value="hours">Time Spent per Week</option>
              <option value="difficulty-grade">Difficulty vs Grade</option>
            </select>
          </div>

          {selectedGraph === "distribution" && (
            <div className="w-full overflow-x-auto">
              <svg width="100%" height="280" viewBox="0 0 520 280">
                <line x1="50" y1="20" x2="50" y2="220" stroke="#ccc" />
                <line x1="50" y1="220" x2="500" y2="220" stroke="#ccc" />

                {Object.entries(gradeDistribution).map(([grade, count], i) => {
                  const barWidth = 28;
                  const gap = 10;
                  const x = 60 + i * (barWidth + gap);
                  const barHeight = maxGradeCount === 0 ? 0 : (count / maxGradeCount) * 170;
                  const y = 220 - barHeight;

                  return (
                    <g key={grade}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill="#2563eb"
                        rx="4"
                      />
                      <text
                        x={x + barWidth / 2}
                        y={240}
                        fontSize="10"
                        textAnchor="middle"
                        fill="#555"
                      >
                        {grade}
                      </text>
                      <text
                        x={x + barWidth / 2}
                        y={y - 6}
                        fontSize="10"
                        textAnchor="middle"
                        fill="#333"
                      >
                        {count}
                      </text>
                    </g>
                  );
                })}

                {Array.from({ length: maxGradeCount + 1 }, (_, tick) => {
                  const y = 220 - (tick / Math.max(maxGradeCount, 1)) * 170;
                  return (
                    <g key={tick}>
                      <line x1="45" y1={y} x2="50" y2={y} stroke="#999" />
                      <text x="35" y={y + 4} fontSize="10" textAnchor="middle">
                        {tick}
                      </text>
                    </g>
                  );
                })}

                <text x="275" y="265" textAnchor="middle" fontSize="12">
                  Grade
                </text>

                <text
                  x="15"
                  y="130"
                  textAnchor="middle"
                  fontSize="12"
                  transform="rotate(-90 15,130)"
                >
                  Number of Students
                </text>
              </svg>
            </div>
          )}

          {selectedGraph === "over-time" && (
            <div className="w-full overflow-x-auto">
              <svg width="100%" height="260" viewBox="0 0 560 260">
                <line x1="70" y1="20" x2="70" y2="180" stroke="#ccc" />
                <line x1="70" y1="180" x2="520" y2="180" stroke="#ccc" />

                {[0, 1, 2, 3, 4].map((tick) => {
                  const y = 180 - (tick / 4) * 160;
                  return (
                    <g key={tick}>
                      <line x1="65" y1={y} x2="70" y2={y} stroke="#999" />
                      <text x="55" y={y + 4} fontSize="10" textAnchor="end" fill="#555">
                        {gpaTickLabel(tick)}
                      </text>
                    </g>
                  );
                })}

                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  points={gradeOverTime
                    .map((item, i) => {
                      const x = 70 + i * (450 / Math.max(gradeOverTime.length - 1, 1));
                      const y = 180 - (item.value / 4) * 160;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />

                {gradeOverTime.map((item, i) => {
                  const x = 70 + i * (450 / Math.max(gradeOverTime.length - 1, 1));
                  const y = 180 - (item.value / 4) * 160;

                  return <circle key={i} cx={x} cy={y} r="4" fill="#2563eb" />;
                })}

                {gradeOverTime.map((item, i) => {
                  const x = 70 + i * (450 / Math.max(gradeOverTime.length - 1, 1));

                  return (
                    <text
                      key={i}
                      x={x}
                      y={205}
                      fontSize="10"
                      textAnchor="middle"
                      fill="#555"
                    >
                      {item.label}
                    </text>
                  );
                })}

                <text x="295" y="235" textAnchor="middle" fontSize="12">
                  Semester
                </text>

                <text
                  x="18"
                  y="100"
                  textAnchor="middle"
                  fontSize="12"
                  transform="rotate(-90 18,100)"
                >
                  Average Grade (GPA)
                </text>
              </svg>
            </div>
          )}

          {selectedGraph === "per-instructor" && (
            <div className="w-full overflow-x-auto">
              <svg width="100%" height="340" viewBox="0 0 620 340">
                <line x1="70" y1="20" x2="70" y2="220" stroke="#ccc" />
                <line x1="70" y1="220" x2="580" y2="220" stroke="#ccc" />

                {[0, 1, 2, 3, 4].map((tick) => {
                  const y = 220 - (tick / 4) * 170;
                  return (
                    <g key={tick}>
                      <line x1="65" y1={y} x2="70" y2={y} stroke="#999" />
                      <text x="55" y={y + 4} fontSize="10" textAnchor="end" fill="#555">
                        {gpaTickLabel(tick)}
                      </text>
                    </g>
                  );
                })}

                {gradeByInstructor.map((item, i) => {
                  const barWidth = 40;
                  const gap = 30;
                  const totalWidth = gradeByInstructor.length * (barWidth + gap) - gap;
                  const startX = (620 - totalWidth) / 2;
                  const x = startX + i * (barWidth + gap);
                  const barHeight = (item.value / 4) * 170;
                  const y = 220 - barHeight;

                  return (
                    <g key={item.label}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill="#2563eb"
                        rx="4"
                      />

                      <text
                        x={x + barWidth / 2}
                        y={y - 8}
                        fontSize="10"
                        textAnchor="middle"
                        fill="#333"
                      >
                        {item.value.toFixed(2)} ({gpaToLetter(item.value)})
                      </text>

                      <text
                        x={x + barWidth / 2}
                        y={250}
                        fontSize="10"
                        textAnchor="end"
                        transform={`rotate(-45 ${x + barWidth / 2},250)`}
                        fill="#555"
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                })}

                <text x="325" y="315" textAnchor="middle" fontSize="12">
                  Instructor
                </text>

                <text
                  x="18"
                  y="120"
                  textAnchor="middle"
                  fontSize="12"
                  transform="rotate(-90 18,120)"
                >
                  Average Grade (GPA)
                </text>
              </svg>
            </div>
          )}

          {selectedGraph === "hours" && (
            <div className="w-full overflow-x-auto">
              <svg width="100%" height="280" viewBox="0 0 520 280">
                <line x1="50" y1="20" x2="50" y2="220" stroke="#ccc" />
                <line x1="50" y1="220" x2="500" y2="220" stroke="#ccc" />

                {(() => {
                  const barWidth = 40;
                  const gap = 15;

                  const totalWidth = hoursBuckets.length * (barWidth + gap) - gap;
                  const startX = (520 - totalWidth) / 2;

                  return hoursBuckets.map((item, i) => {
                    const x = startX + i * (barWidth + gap);
                    const barHeight =
                      maxHoursCount === 0
                        ? 0
                        : (item.value / maxHoursCount) * 170;
                    const y = 220 - barHeight;

                    return (
                      <g key={item.label}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill="#10b981"
                          rx="4"
                        />
                        <text
                          x={x + barWidth / 2}
                          y={240}
                          fontSize="10"
                          textAnchor="middle"
                          fill="#555"
                        >
                          {item.label}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y={y - 6}
                          fontSize="10"
                          textAnchor="middle"
                          fill="#333"
                        >
                          {item.value}
                        </text>
                      </g>
                    );
                  });
                })()}

                {Array.from({ length: maxHoursCount + 1 }, (_, tick) => {
                  const y = 220 - (tick / Math.max(maxHoursCount, 1)) * 170;
                  return (
                    <g key={tick}>
                      <line x1="45" y1={y} x2="50" y2={y} stroke="#999" />
                      <text x="35" y={y + 4} fontSize="10" textAnchor="middle">
                        {tick}
                      </text>
                    </g>
                  );
                })}

                <text x="275" y="265" textAnchor="middle" fontSize="12">
                  Hours per Week
                </text>

                <text
                  x="15"
                  y="130"
                  textAnchor="middle"
                  fontSize="12"
                  transform="rotate(-90 15,130)"
                >
                  Number of Students
                </text>
              </svg>
            </div>
          )}

          {selectedGraph === "difficulty-grade" && (
            <div className="w-full overflow-x-auto">
              <svg width="100%" height="260" viewBox="0 0 500 260">

                <line x1="50" y1="20" x2="50" y2="200" stroke="#ccc" />
                <line x1="50" y1="200" x2="480" y2="200" stroke="#ccc" />

                {reviews.map((r, i) => {
                  if (!r.grade) return null;

                  const g = normalizeGrade(r.grade);
                  if (!g) return null;

                  const x = 50 + ((r.difficulty - 1) / 4) * 430;
                  const y = 200 - (gradeToPoints(g) / 4) * 180;

                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#ef4444"
                      opacity="0.7"
                    />
                  );
                })}

                {[1, 2, 3, 4, 5].map((d) => {
                  const x = 50 + ((d - 1) / 4) * 430;
                  return (
                    <text key={d} x={x} y={220} fontSize="10" textAnchor="middle">
                      {d}
                    </text>
                  );
                })}

                {[0, 1, 2, 3, 4].map((g) => {
                  const y = 200 - (g / 4) * 180;
                  return (
                    <text key={g} x={25} y={y + 3} fontSize="10">
                      {g}
                    </text>
                  );
                })}

                <text x="250" y="250" textAnchor="middle" fontSize="12">
                  Difficulty
                </text>

                <text
                  x="10"
                  y="120"
                  textAnchor="middle"
                  fontSize="12"
                  transform="rotate(-90 10,120)"
                >
                  Grade in Class
                </text>

              </svg>
            </div>
          )}
        </div>

        {/* AI Overview */}
        <div className="mt-6 bg-white border border-blue-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">✦ AI Overview</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">AI</span>
            </div>
            {!aiOverview && !aiLoading && (
              <button
                onClick={fetchAiOverview}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                Generate
              </button>
            )}
          </div>
          {aiLoading && <p className="text-sm text-gray-400">Summarizing reviews...</p>}
          {aiOverview && <p className="text-sm text-gray-700 leading-relaxed">{aiOverview}</p>}
          {!aiOverview && !aiLoading && (
            <p className="text-sm text-gray-400">Click Generate to get an AI summary of all reviews.</p>
          )}
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
