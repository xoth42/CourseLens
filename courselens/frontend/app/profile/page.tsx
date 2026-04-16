"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";

export default function Profile() {
    
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
        const { data } = await supabase.auth.getUser();
        setEmail(data.user?.email ?? null);
        };

        fetchUser();
    }, []);

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
            </div>
        </div>
    </div>
    
    </>
    )
}