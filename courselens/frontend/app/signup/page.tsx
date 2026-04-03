"use client"


import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";


export default function Signup() {
   const [name, setName] = useState("");
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [message, setMessage] = useState("");

   const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email to confirm your account.");
    }
  };


   return (<>
       <div className="bg-[#f8f9fa] min-h-screen flex items-center justify-center">
           <div className="w-[360px]">
           <div className="bg-white shadow-[0_0_20px_rgba(0,0,0,0.2),0_5px_5px_rgba(0,0,0,0.24)] p-[45px] text-center">


           <form className="space-y-4" onSubmit={handleSignup}>
               <h1 className="text-[#2868ce] text-3xl font-extrabold mb-6">Create an Account</h1>
               <input
                   type="text"
                   placeholder="Name"
                   value={name}
                   onChange={(n) => setName(n.target.value)}
                   className="w-full bg-[#f2f2f2] p-[15px] text-sm outline-none text-[#474747]"
               />
               <input
                   type="email"
                   placeholder="Email"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="w-full bg-[#f2f2f2] p-[15px] text-sm outline-none text-[#474747]"
               />
               <input
                   type="password"
                   placeholder="Password"
                   value={password}
                   onChange={(p) => setPassword(p.target.value)}
                   className="w-full bg-[#f2f2f2] p-[15px] text-sm outline-none text-[#474747]"
               />
               <button className="w-full bg-[#3775d8] text-white py-[15px] font-bold uppercase hover:bg-[#1a50a7] transition">
                Create
                </button>
                {message && (
                   <p className="text-sm text-gray-600">{message}</p>
                )}
               <p className="text-[#898989] text-xs mt-4">
                   Already registered?{" "}
                   <Link href="/login" className="text-[#2868ce] no-underline hover:text-[#113b7d] transition">
                       Sign In
                   </Link>
               </p>
           </form>


           </div>
           </div>
       </div></>
   );
}
