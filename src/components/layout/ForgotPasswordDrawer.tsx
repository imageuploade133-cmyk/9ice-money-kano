"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, PanInfo, useAnimation } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { formatFirebaseError } from "@/lib/utils";

interface ForgotPasswordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordDrawer: React.FC<ForgotPasswordDrawerProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState("");

  useModalBackHandler(isOpen, onClose, "forgot-password-drawer");
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const controls = useAnimation();

  // Reset local form states on open/close transition
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setIsSuccess(false);
      setLoading(false);
    }
  }, [isOpen]);

  // Prevent background body scroll when drawer is open (Native app-like scroll-locking)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setIsSuccess(true);
      toast.success("Password reset email sent!");
    } catch (err: unknown) {
      console.error("Password Reset Error:", err);
      const friendlyMessage = formatFirebaseError(err);
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle drag to dismiss gesture
  const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    } else {
      controls.start({ y: 0 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur/Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto"
          />

          {/* Bottom Drawer Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 450 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[24px] border-t border-gray-200 p-6 pb-8 z-[9999] flex flex-col items-center select-none cursor-default shadow-none"
          >
            {/* Draggable indicator bar */}
            <div className="w-10 h-1 bg-gray-300 rounded-full mb-4 cursor-grab active:cursor-grabbing" />

            {/* Header style */}
            <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
              <div className="w-8" /> {/* Spacer */}
              <h2 className="font-hanken font-bold text-base text-black text-center">
                Reset Password
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            {!isSuccess ? (
              <form onSubmit={handleResetPassword} className="w-full flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] mb-4">
                  <span className="material-symbols-outlined text-[28px]">lock_reset</span>
                </div>

                <p className="font-hanken text-sm text-gray-500 text-center max-w-[290px] mb-6 leading-relaxed">
                  Enter your registered email address below, and we will send you secure recovery instructions to reset your password.
                </p>

                {/* Email Address Input - styled with solid black borders for premium layout */}
                <div className="w-full space-y-1.5 text-left mb-6">
                  <label htmlFor="reset-email" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email Address</label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                    placeholder="Enter your registered email..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-bold uppercase tracking-widest rounded-2xl active:scale-95 transition-all shadow-none cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                        className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                      />
                      <span>Sending Secure Link...</span>
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            ) : (
              <div className="w-full flex flex-col items-center animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
                  <span className="material-symbols-outlined text-[28px] font-black">check_circle</span>
                </div>

                <h3 className="font-hanken font-bold text-sm text-black text-center mb-1">Check Your Inbox</h3>
                <p className="font-hanken text-xs text-gray-500 text-center max-w-[290px] mb-8 leading-relaxed">
                  We have sent secure password recovery instructions to <strong className="text-black font-semibold">{email}</strong>. Please check your inbox and junk/spam folder.
                </p>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-2xl active:scale-95 transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
