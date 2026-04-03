"use client"


import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";


export default function Login() {
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [message, setMessage] = useState("");
   const router = useRouter();

   const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
  
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
  
    if (error) {
      setMessage(error.message);
    } else {
      router.push("/courses");
    }
  };

   return (<>
       <div className="bg-[#f8f9fa] min-h-screen flex items-center justify-center">
           <div className="w-[360px]">
           <div className="bg-white shadow-[0_0_20px_rgba(0,0,0,0.2),0_5px_5px_rgba(0,0,0,0.24)] p-[45px] text-center">


           <form className="space-y-4" onSubmit={handleLogin}>
               <h1 className="text-[#2868ce] text-3xl font-bold mb-6">Sign In</h1>
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
               <button className="w-full bg-[#3775d8] text-white py-[15px] font-bold uppercase hover:bg-[#1a50a7] transition">Login</button>
               {message && <p className="text-sm text-red-500">{message}</p>}
               <p className="text-[#898989] text-xs mt-4">
                   Not registered?{" "}
                   <Link href="/signup" className="text-[#2868ce] no-underline hover:text-[#113b7d] transition">
                       Create an account
                   </Link>
               </p>
           </form>


           </div>
           </div>
       </div></>
   );
}


