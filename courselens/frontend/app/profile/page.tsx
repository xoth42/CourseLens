"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function Profile() {
    
    const { id } = useParams();
    const [email, setEmail] = useState<string | null>(null);
    const [studentid, setStudentId] = useState(0);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [courseName, setCourseName] = useState<string | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? null);
        };

        fetchUser();
    }, []);

    useEffect(() => {
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

    return (<>
    
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f8f9fa]">
        <div className="w-[500px]">
            <div className="bg-white shadow-[0_0_20px_rgba(0,0,0,0.2),0_5px_5px_rgba(0,0,0,0.24)] p-[45px] text-center">
                <h1 className="text-[#2868ce] text-3xl font-bold mb-6">Profile</h1>

                <p className="text-sm text-black text-left">Email:</p>
                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-500 text-left">{email}</div>
                </div>
                <p className="text-[#2868ce] text-sm mt-4">See past reviews</p>
                
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    {loading ? (
                        <p className="text-sm text-gray-500">Loading reviews...</p>
                    ) : reviews.length === 0 ? (
                        <p className="text-sm text-gray-500">No reviews yet.</p>
                    ) : (
                        reviews.map((review) => (
                        <div key={review.id} className="mb-6 border-b pb-4 last:border-b-0">
                            
                            <p className="text-sm text-black text-left">{review.course_metrics?.code}</p>

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
            </div>
        </div>
    </div>
    
    </>
    )
}