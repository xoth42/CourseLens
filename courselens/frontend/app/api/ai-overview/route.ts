import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "Missing courseId" }, { status: 400 });

  const { data: reviews, error } = await supabase
    .from("course_evaluations")
    .select("rating, difficulty, grade, comment")
    .eq("course_id", Number(courseId));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const comments = reviews
    .filter((r) => r.comment)
    .map((r, i) => `Review ${i + 1} (Rating: ${r.rating}/5, Difficulty: ${r.difficulty}/5, Grade: ${r.grade ?? "N/A"}): ${r.comment}`)
    .join("\n\n");

  if (!comments) return NextResponse.json({ overview: null });

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: `You are summarizing student reviews for a university course. Based on the following reviews, write a concise 3-4 sentence overview that covers: overall sentiment, workload and difficulty, what students liked most, and any common criticisms. Be balanced and direct. Do not include any intro sentence like "Here is a summary" — just write the summary directly.\n\n${comments}`,
        },
      ],
    });

    const overview = completion.choices[0]?.message?.content ?? null;
    return NextResponse.json({ overview });
  } catch (err) {
    console.error("Groq error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
