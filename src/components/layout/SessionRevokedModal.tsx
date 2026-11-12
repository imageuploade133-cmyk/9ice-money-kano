"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

export interface SessionRevokedData {
  previousDevice?: string;
  previousCreatedAt?: string;
  currentDevice?: string;
  currentCreatedAt?: string;
}

interface SessionRevokedModalProps {
  isOpen: boolean;
  sessionData?: SessionRevokedData | null;
  onClose?: () => void;
}

export function SessionRevokedModal({
  isOpen,
  sessionData,
  onClose,
}: SessionRevokedModalProps) {
  useModalBackHandler(isOpen, () => {
    // Prevent closing without acknowledging logout
  }, "session-revoked-full-modal");

  if (!isOpen) return null;

  const prevDevice = sessionData?.previousDevice || "Previous Device / Browser";
  const prevTime = sessionData?.previousCreatedAt
    ? new Date(sessionData.previousCreatedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Recently Active";

  const currDevice = sessionData?.currentDevice || "New Active Device";
  const currTime = sessionData?.currentCreatedAt
    ? new Date(sessionData.currentCreatedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Just Now";

  const handleAcknowledgeLogout = () => {
    if (onClose) onClose();
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  };

  const handleReportSupport = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/support";
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200000] w-full h-full bg-slate-900/95 backdrop-blur-xl flex flex-col justify-between overflow-y-auto p-4 sm:p-6"
      >
        <div className="max-w-lg w-full mx-auto my-auto flex flex-col items-center text-center py-6">
          {/* Animated Header Security Emblem */}
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-6 shadow-xl shadow-amber-500/10 animate-pulse">
            <span className="material-symbols-outlined text-4xl">devices_off</span>
          </div>

          <span className="px-3.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 tracking-wide uppercase mb-3">
            Active Session Security Lock
          </span>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
            Account Signed In On Another Device
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed mb-6 px-2">
            To safeguard your funds and personal information, E-Global Pay strictly enforces a single active device policy. Your account was just accessed from a new device, and this previous session has been automatically logged out.
          </p>

          {/* Detailed Session Breakdown Cards */}
          <div className="w-full space-y-3.5 text-left mb-6">
            {/* Device Logged Out (This Device) */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-400 text-lg">logout</span>
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                    Session Logged Out (This Device)
                  </span>
                </div>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-semibold px-2 py-0.5 rounded-full border border-rose-500/30">
                  Revoked
                </span>
              </div>

              <div className="space-y-1 pl-6 border-l-2 border-rose-500/30">
                <p className="text-sm font-semibold text-white truncate">{prevDevice}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">schedule</span>
                  Session revoked: {prevTime}
                </p>
              </div>
            </div>

            {/* New Device Logged In */}
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-lg">login</span>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    New Active Login
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Active Now
                </span>
              </div>

              <div className="space-y-1 pl-6 border-l-2 border-emerald-500/30">
                <p className="text-sm font-semibold text-white truncate">{currDevice}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">event_available</span>
                  Signed in: {currTime}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-3">
            <button
              onClick={handleAcknowledgeLogout}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:opacity-95 text-white font-bold text-base shadow-lg shadow-[#FC7A00]/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to Login</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>

            <button
              onClick={handleReportSupport}
              className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">gavel</span>
              <span>Wasn&apos;t you? Kindly Report to Support Immediately</span>
            </button>
          </div>
        </div>

        {/* Footer Security Notice */}
        <div className="max-w-lg w-full mx-auto text-center pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-400 text-sm">shield</span>
            E-Global Pay Enterprise Security Guard • Fail-Closed Device Isolation
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
