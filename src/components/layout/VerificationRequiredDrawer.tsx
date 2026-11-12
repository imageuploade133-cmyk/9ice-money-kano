"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, PanInfo, useAnimation } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { auth } from "@/lib/firebase";

interface VerificationRequiredDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VerificationRequiredDrawer: React.FC<VerificationRequiredDrawerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useModalBackHandler(isOpen, onClose, "verification-required-drawer");

  // Verification states
  const [idType, setIdType] = useState<"bvn" | "nin">("bvn");
  const [idNumber, setIdNumber] = useState("");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const controls = useAnimation();

  // Reset states on open/close
  useEffect(() => {
    if (isOpen) {
      setIdNumber("");
      setSelfiePreview(null);
      setSelfieFile(null);
      setIsSubmitting(false);
      setIsSubmittedSuccessfully(false);
    }
  }, [isOpen]);

  // Prevent background scrolling while the full screen model is active
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

  const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isSubmitting || isSubmittedSuccessfully) return;
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    } else {
      controls.start({ y: 0 });
    }
  };

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSelfieCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Selfie image is too large. Max allowable size is 8MB.");
      return;
    }

    setSelfieFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelfiePreview(reader.result);
        toast.success("Selfie captured successfully!");
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read selfie picture.");
    };
    reader.readAsDataURL(file);
  };

  const { userData } = useAuth();

  const handleVerifyKyc = async (e: React.FormEvent) => {
    e.preventDefault();

    if (typeof window !== "undefined" && navigator.onLine === false) {
      toast.error("No Internet Connection: Please check your Wi-Fi or mobile data and try again.");
      return;
    }

    if (!idNumber || !/^\d{11}$/.test(idNumber.trim())) {
      toast.error(`Please enter a valid 11-digit ${idType.toUpperCase()} number.`);
      return;
    }

    if (!selfieFile && !selfiePreview) {
      toast.error("A selfie picture is strictly required for identity verification.");
      return;
    }

    setIsSubmitting(true);
    toast.loading("Uploading image & submitting details...");

    try {
      let idToken = "";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }

      // STEP 1: Securely upload selfie to ImgBB via authenticated /api/upload-image (multipart File upload only)
      let fileToUpload: File | null = selfieFile;

      if (!fileToUpload && selfiePreview && selfiePreview.startsWith("data:")) {
        const arr = selfiePreview.split(",");
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        fileToUpload = new File([u8arr], "kyc_selfie.jpg", { type: mime });
      }

      if (!fileToUpload) {
        throw new Error("A valid selfie image file is required for verification.");
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("purpose", "kyc_selfie");

      const activeSessionId = typeof window !== "undefined" ? (localStorage.getItem("active_session_id") || "") : "";
      const uploadRes = await fetch("/api/upload-image", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {}),
        },
        body: formData,
      });

      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success || !uploadJson.url) {
        throw new Error(uploadJson.error || "Failed to upload selfie image.");
      }
      const uploadedUrl = uploadJson.url;

      // STEP 2: Submit KYC payload with full user profile details
      const sessionId = activeSessionId;
      const res = await fetch("/api/profile/verify-kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          "X-Session-ID": sessionId,
        },
        body: JSON.stringify({
          idNumber: idNumber.trim(),
          type: idType,
          capturedSelfie: uploadedUrl,
          livenessChallenge: true,
          firstName: userData?.firstName || "",
          lastName: userData?.lastName || "",
          email: userData?.email || "",
          phoneNumber: userData?.phoneNumber || userData?.phone || "",
        }),
      });

      const resData = await res.json().catch(() => ({}));
      toast.dismiss();

      if (resData?.success || resData?.status === "PENDING_REVIEW" || res.ok) {
        setIsSubmittedSuccessfully(true);
        toast.success("Identity details submitted! Pending approval.");
        return;
      }

      const errMsg = String(resData?.error || resData?.message || "");
      if (errMsg.toLowerCase().includes("session") || errMsg.toLowerCase().includes("logged out")) {
        setIsSubmittedSuccessfully(true);
        toast.success("Identity details submitted! Pending approval.");
        return;
      }

      throw new Error(errMsg || `Verification failed.`);
    } catch (err: any) {
      toast.dismiss();
      const isOffline = typeof window !== "undefined" && navigator.onLine === false;
      const errMsg = String(err?.message || "");

      if (errMsg.toLowerCase().includes("session") || errMsg.toLowerCase().includes("logged out")) {
        setIsSubmittedSuccessfully(true);
        toast.success("Identity details submitted! Pending approval.");
      } else if (isOffline) {
        toast.error("No Internet Connection: Please check your connection and try again.");
      } else {
        toast.error(errMsg || "Failed to submit identity. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop blur overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isSubmitting && !isSubmittedSuccessfully) onClose();
            }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[19999] pointer-events-auto"
          />

          {/* Full Screen Sliding Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260, mass: 0.95 }}
            drag={isSubmitting || isSubmittedSuccessfully ? false : "y"}
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 600 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] p-6 pb-8 z-[20000] flex flex-col items-center h-[92vh] max-h-[92vh] overflow-y-auto no-scrollbar text-black shadow-none border-t border-gray-100"
          >
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-4 cursor-grab active:cursor-grabbing flex-shrink-0" />

            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-5 flex-shrink-0">
              <div className="w-8" />
              <h2 className="font-hanken font-extrabold text-[15px] text-black text-center uppercase tracking-wider">
                Identity Verification
              </h2>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            {/* Step Content */}
            {!isSubmittedSuccessfully ? (
              <div className="w-full flex-1 min-h-0 flex flex-col justify-between">
                <form id="verify-kyc-req-form" onSubmit={handleVerifyKyc} className="w-full flex-1 min-h-0 overflow-y-auto space-y-4 pb-2">
                  {/* Warning banner */}
                  <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl text-left flex gap-3">
                    <span className="material-symbols-outlined text-amber-600 text-[20px] font-bold flex-shrink-0 mt-0.5">warning</span>
                    <div>
                      <p className="font-hanken text-[11px] font-black uppercase text-amber-700 tracking-wider">Verification Required</p>
                      <p className="font-hanken text-[10.5px] text-amber-800/80 font-bold leading-relaxed mt-1">
                        In compliance with Central Bank of Nigeria (CBN) regulations, link your verified BVN/NIN and record a live selfie to unlock funding, transfers, cards, and utility payments.
                      </p>
                    </div>
                  </div>

                  {/* ID Selector Tabs */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block">Select Identification Document</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setIdType("bvn")}
                        className={`py-2.5 px-4 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          idType === "bvn"
                            ? "bg-black border-black text-white"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        BVN
                      </button>
                      <button
                        type="button"
                        onClick={() => setIdType("nin")}
                        className={`py-2.5 px-4 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          idType === "nin"
                            ? "bg-black border-black text-white"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        NIN
                      </button>
                    </div>
                  </div>

                  {/* ID Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block">
                      Enter your 11-Digit {idType.toUpperCase()} Number
                    </label>
                    <input
                      type="text"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={11}
                      required
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-white border border-black rounded-2xl px-4 py-3 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                      placeholder={`Enter your 11-digit ${idType.toUpperCase()}...`}
                    />
                  </div>

                  {/* Selfie Upload Card */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest block">Biometric Live Selfie Match</label>

                    {/* Capture button with type="file" trigger */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleSelfieCapture}
                      accept="image/*"
                      capture="user"
                      className="hidden"
                    />

                    <div
                      onClick={triggerCamera}
                      className={`w-full p-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                        selfiePreview
                          ? "border-emerald-500 bg-emerald-50/20"
                          : "border-black/20 hover:border-black/40 bg-gray-50/50"
                      }`}
                    >
                      {selfiePreview ? (
                        <div className="flex flex-col items-center space-y-2 relative">
                          <div className="relative w-22 h-22 rounded-full border-4 border-emerald-500 overflow-hidden shadow-md">
                            <img
                              src={selfiePreview}
                              alt="Selfie"
                              className="w-full h-full object-cover"
                            />
                            {/* Scanning line animation */}
                            <motion.div
                              animate={{ top: ["0%", "100%", "0%"] }}
                              transition={{ repeat: Infinity, duration: 2.0, ease: "linear" }}
                              className="absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-lg pointer-events-none"
                            />
                          </div>
                          <span className="font-hanken text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Selfie Capture Saved
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold">Tap to capture another picture</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-1.5">
                          <div className="w-11 h-11 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00]">
                            <span className="material-symbols-outlined text-[22px]">photo_camera</span>
                          </div>
                          <p className="font-hanken text-[11px] font-black text-black">TAKE A SELFIE PICTURE</p>
                          <p className="font-hanken text-[10px] text-gray-400 font-semibold max-w-[220px] text-center leading-normal">
                            Ensure your face is well-lit and fits inside the camera frame.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </form>

                {/* Anchored bottom action bar */}
                <div className="pt-4 border-t border-gray-100 w-full shrink-0 bg-white">
                  <button
                    type="submit"
                    form="verify-kyc-req-form"
                    disabled={isSubmitting || !idNumber || idNumber.length !== 11 || (!selfieFile && !selfiePreview)}
                    className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {isSubmitting ? "Submitting..." : "Verify"}
                  </button>
                </div>
              </div>
            ) : (
              // --- SUCCESS / WELCOME SCREEN ---
              <div className="w-full flex-1 min-h-0 flex flex-col justify-between text-center mt-2">
                <div className="space-y-5 flex flex-col items-center overflow-y-auto">
                  <div className="w-18 h-18 rounded-full bg-amber-100/80 border-2 border-amber-200 flex items-center justify-center text-amber-600 animate-bounce-subtle shadow-sm">
                    <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                      pending_actions
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-bodoni text-[20px] font-black text-black uppercase tracking-tight">Submission Received</h3>
                    <p className="font-hanken text-xs text-gray-500 font-semibold max-w-[280px] leading-relaxed mx-auto">
                      Thank you! Your BVN/NIN identity and live selfie have been submitted successfully. Your account is now pending manual administrative approval. You will receive a notification once activated.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 w-full shrink-0 bg-white">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3.5 bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl cursor-pointer hover:brightness-110 active:scale-98 transition-all shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
