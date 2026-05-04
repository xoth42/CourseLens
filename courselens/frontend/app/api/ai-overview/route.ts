import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type AiSummary = {
  overall_sentiment: string;
  praises: string[];
  complaints: string[];
  workload_summary: string;
  good_fit: string;
  poor_fit: string;
  total_reviews: number;
  with_comments: number;
  confidence: "High" | "Medium" | "Low";
  generated_at?: string;
};

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "Missing courseId" }, { status: 400 });

  let gradeDistribution: Record<string, number> | null = null;
  const gradeDistParam = req.nextUrl.searchParams.get("gradeDistribution");
  if (gradeDistParam) {
    try { gradeDistribution = JSON.parse(gradeDistParam); } catch {}
  }

  const { data: reviews, error } = await supabase
    .from("course_evaluations")
    .select("rating, difficulty, grade, comment, hours_per_week, semester, professor_name")
    .eq("course_id", Number(courseId));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalReviews = reviews.length;
  const withComments = reviews.filter((r) => r.comment).length;

  if (withComments < 3) {
    return NextResponse.json({ summary: null, tooFewReviews: true, totalReviews, withComments });
  }

  // Deterministic stats for the prompt
  const hoursArr = reviews.filter((r) => r.hours_per_week != null).map((r) => r.hours_per_week as number);
  const avgHours = hoursArr.length > 0
    ? (hoursArr.reduce((a, b) => a + b, 0) / hoursArr.length).toFixed(1)
    : null;

  const diffArr = reviews.filter((r) => r.difficulty != null).map((r) => r.difficulty as number);
  const avgDifficulty = diffArr.length > 0
    ? (diffArr.reduce((a, b) => a + b, 0) / diffArr.length).toFixed(1)
    : null;

  const confidence: AiSummary["confidence"] = withComments >= 10 ? "High" : withComments >= 5 ? "Medium" : "Low";

  const formattedReviews = reviews
    .filter((r) => r.comment)
    .map((r, i) =>
      `Review ${i + 1} (Rating: ${r.rating}/5, Difficulty: ${r.difficulty ?? "N/A"}/5, Grade: ${r.grade ?? "N/A"}, Hours/week: ${r.hours_per_week ?? "N/A"}): ${r.comment}`
    )
    .join("\n\n");

  const gradeDistLine = gradeDistribution
    ? "Grade distribution: " +
      Object.entries(gradeDistribution)
        .filter(([, count]) => count > 0)
        .map(([grade, count]) => `${grade}: ${count}`)
        .join(", ")
    : null;

  const statLines = [
    `Total reviews: ${totalReviews}`,
    `Reviews with written comments: ${withComments}`,
    avgHours != null ? `Avg hours/week reported: ${avgHours}` : null,
    avgDifficulty != null ? `Avg difficulty: ${avgDifficulty}/5` : null,
    gradeDistLine,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are summarizing student reviews for a university course.
Return ONLY a valid JSON object — no prose, no markdown fences, no explanation.

Schema (all fields required, use null if there is no evidence):
{
  "overall_sentiment": "one sentence",
  "praises": ["up to 3 short bullets of what students praised"],
  "complaints": ["up to 3 short bullets of common complaints"],
  "workload_summary": "one sentence about workload and difficulty",
  "good_fit": "one sentence: who this course suits",
  "poor_fit": "one sentence: who may struggle"
}

Rules:
- Only infer from the provided reviews — do not add outside knowledge
- Keep each bullet under 12 words
- If evidence for a field is insufficient, use null

Computed stats (use these exactly, do not recalculate):
${statLines}

Reviews:
${formattedReviews}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed: Omit<AiSummary, "total_reviews" | "with_comments" | "confidence"> | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Attempt to extract JSON from within the response
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed) {
      return NextResponse.json({ error: "Model returned unparseable response", raw }, { status: 500 });
    }

    const summary: AiSummary = {
      ...parsed,
      total_reviews: totalReviews,
      with_comments: withComments,
      confidence,
    };

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Groq error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
