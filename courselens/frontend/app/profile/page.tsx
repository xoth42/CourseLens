"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function Profile() {
    
    const { id } = useParams();
    const [email, setEmail] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [studentid, setStudentId] = useState(0);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reviewVis, setVis] = useState(false);
    const [courseRequests, setCourseRequests] = useState<{
      id: number;
      subject: string;
      course_number: string;
      class_name: string;
      status: string;
      denial_reason: string | null;
      created_at: string;
    }[]>([]);

    useEffect(() => {
        const fetchUser = async () => {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? null);
        setUserId(data.user?.id ?? null);
        };

        fetchUser();
    }, []);

    useEffect(() => {
    if (!email) return;
    async function fetchStudentId() {
      const { data, error } = await supabase
        .from("student_profiles")
        .select("id")
        .eq("email", email)
        .single();

        if (!error && data) setStudentId(data.id);
    }
    fetchStudentId();
  }, [email]);

  useEffect(() => {
    async function fetchReviews() {
      const { data, error } = await supabase
        .from("course_evaluations")
        .select("id, course_id, rating, difficulty, grade, semester, professor_name, hours_per_week, comment, created_at, course_metrics (code)")
        .eq("student_profile_id", studentid)
        .order("created_at", {ascending: false});

        if (!error && data) setReviews(data);

        setLoading(false);
    }
    fetchReviews();
  }, [studentid]);

    useEffect(() => {
      if (!userId) return;
      async function fetchRequests() {
        const { data } = await supabase
          .from("class_add_requests")
          .select("id, subject, course_number, class_name, status, denial_reason, created_at")
          .eq("requested_by_user_id", userId)
          .order("created_at", { ascending: false });
        if (data) setCourseRequests(data);
      }
      fetchRequests();
    }, [userId]);

    const firstThree = reviews.slice(0,3);
    const restRevs = reviews.slice(3);

    return (<>
    
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f8f9fa]">
        <div className="w-[500px]">
            <div className="bg-white shadow-[0_0_20px_rgba(0,0,0,0.2),0_5px_5px_rgba(0,0,0,0.24)] p-[45px] text-center mt-6">
                <h1 className="text-[#2868ce] text-3xl font-bold mb-6">Profile</h1>

                <p className="text-sm text-black text-left">Email:</p>
                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-500 text-left">{email}</div>
                </div>

                <Link href="/bookmarks" className="flex text-sm text-[#2868ce] mt-4 no-underline hover:text-[#1a50a7] transition">
                       Bookmarked Courses
                   </Link>

                <p className="text-sm text-black text-left mt-4">Past Reviews:</p>

                <div>
                    {loading ? (
                        <p className="text-sm text-gray-500">Loading reviews...</p>
                    ) : firstThree.length === 0 ? (
                        <p className="text-sm text-gray-500">No reviews yet.</p>
                    ) : (
                        firstThree.map((review) => (
                        <div key={review.id} className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-2">

                            <Link href={`/courses/${review.course_id}`} className="flex text-sm text-black text-left font-bold">
                                {review.course_metrics?.code}
                            </Link>

                            {review.semester && (
                            <div className="flex justify-end mb-3">
                                <span className="text-xs text-gray-400">
                                {review.semester}
                                </span>
                            </div>
                            )}

                            <div className="flex flex-wrap gap-3 mb-3 text-sm">
                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                                Rating: {review.rating?.toFixed(1)} / 5
                            </span>

                            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-md">
                                Difficulty: {review.difficulty?.toFixed(1)} / 5
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
                        </div>
                        ))
                    )}
                </div>

                <button className=" flex text-[#2868ce] text-xs mt-4 hover:text-[#1a50a7] transition" onClick={() => setVis(!reviewVis)}>
                    {reviewVis? 'Hide': 'See All Past Reviews'}</button>
                    {reviewVis && (
                    <section>
                        <div>
                            {loading ? (
                                <p className="text-sm text-gray-500">Loading reviews...</p>
                            ) : restRevs.length === 0 ? (
                                <p className="text-sm text-gray-500">No reviews yet.</p>
                            ) : (
                                restRevs.map((review) => (
                                <div key={review.id} className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-2">

                                    <Link href={`/courses/${review.course_id}`} className="flex text-sm text-black text-left font-bold">
                                        {review.course_metrics?.code}
                                    </Link>

                                    {review.semester && (
                                    <div className="flex justify-end mb-3">
                                        <span className="text-xs text-gray-400">
                                        {review.semester}
                                        </span>
                                    </div>
                                    )}

                                    <div className="flex flex-wrap gap-3 mb-3 text-sm">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                                        Rating: {review.rating?.toFixed(1)} / 5
                                    </span>

                                    <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-md">
                                        Difficulty: {review.difficulty?.toFixed(1)} / 5
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
                                </div>
                                ))
                            )}
                        </div>
                        </section>
                    )}
                {/* Course Requests */}
                {courseRequests.length > 0 && (
                  <div className="mt-6 text-left">
                    <p className="text-sm text-black mb-2">My Course Requests:</p>
                    <div className="flex flex-col gap-2">
                      {courseRequests.map((req) => (
                        <div
                          key={req.id}
                          className={`rounded-xl border p-4 ${
                            req.status === "accepted" ? "bg-green-50 border-green-200" :
                            req.status === "rejected"   ? "bg-red-50 border-red-200"     :
                            "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {req.subject.toUpperCase()}{req.course_number} — {req.class_name}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              req.status === "accepted" ? "bg-green-100 text-green-700" :
                              req.status === "rejected"   ? "bg-red-100 text-red-600"     :
                              "bg-yellow-100 text-yellow-700"
                            }`}>
                              {req.status}
                            </span>
                          </div>
                          {req.status === "rejected" && req.denial_reason && (
                            <p className="text-xs text-red-600 mt-1">Reason: {req.denial_reason}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

            </div>
        </div>
    </div>

    </>
    )
}