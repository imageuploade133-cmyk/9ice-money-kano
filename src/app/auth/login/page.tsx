"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { AppLogo } from "@/components/AppLogo";
import { formatFirebaseError } from "@/lib/utils";
import { ForgotPasswordDrawer } from "@/components/layout/ForgotPasswordDrawer";
import { SessionRevokedModal, SessionRevokedData } from "@/components/layout/SessionRevokedModal";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isRevokedModalOpen, setIsRevokedModalOpen] = useState(false);
  const [revokedSessionData, setRevokedSessionData] = useState<SessionRevokedData | null>(null);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("forgot") === "true") {
        setIsForgotOpen(true);
      }

      // Clean up legacy session revoked notice if present
      if (sessionStorage.getItem("session_revoked_notice")) {
        sessionStorage.removeItem("session_revoked_notice");
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Welcome back!");
      // RouteGuard handles seamless navigation once session verification resolves
    } catch (error: unknown) {
      console.error("Login Error:", error);
      const friendlyMessage = formatFirebaseError(error);
      toast.error(friendlyMessage);
      setLoading(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white p-6 justify-center text-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mx-auto"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
            <AppLogo size={64} />
          </div>
          <h1 className="font-hanken font-bold text-2xl tracking-tight text-black">E-Global Pay</h1>
          <p className="text-gray-500 font-hanken mt-1 text-xs font-semibold">Welcome back to your secure hub</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6" autoComplete="on">
          <div className="space-y-1.5 text-left">
            <label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email Address</label>
            <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
              <input
                id="email"
                name="username"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full appearance-none bg-white border-0 py-3.5 px-4 rounded-[14px] outline-none text-black text-xs font-semibold placeholder-gray-400"
                placeholder="doe@example.com"
                aria-label="Email Address"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-left">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Password</label>
              <button
                type="button"
                onClick={(e) => {
                  handleButtonClick(e);
                  setIsForgotOpen(true);
                }}
                className="text-xs text-[#FC7A00] hover:underline font-bold cursor-pointer bg-transparent border-none outline-none active:scale-95 transition-transform"
              >
                Forgot Password?
              </button>
            </div>
            <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full appearance-none bg-white border-0 py-3.5 pl-4 pr-10 rounded-[14px] outline-none text-black text-xs font-semibold placeholder-gray-400"
                placeholder="••••••••"
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FC7A00] cursor-pointer transition-colors p-1"
                aria-label={showPassword ? "Hide Password" : "Show Password"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility" : "visibility_off"}
                </span>
              </button>
            </div>
          </div>

          {/* Premium login button with ripple in project brand orange colors */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              onClick={handleButtonClick}
              className="relative overflow-hidden w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-110 text-white py-4 rounded-xl border border-white/10 font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2.5 shadow-none"
            >
              {/* Ripple Elements */}
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute bg-white/30 rounded-full pointer-events-none animate-ripple"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: 100,
                    height: 100,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}

              {loading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                  />
                  <span>Authenticating...</span>
                </>
              ) : (
                "Login"
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-[#FC7A00] font-bold underline">
            Sign Up
          </Link>
        </p>
      </motion.div>

      <ForgotPasswordDrawer
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
      />

      <SessionRevokedModal
        isOpen={isRevokedModalOpen}
        sessionData={revokedSessionData}
        onClose={() => setIsRevokedModalOpen(false)}
      />
    </div>
  );
}
