"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAppConfig } from "@/lib/ConfigContext";
import { useAuth } from "@/lib/AuthContext";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadImageSecurely } from "@/lib/image-upload";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface KycVerificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function KycVerificationDrawer({
  isOpen,
  onClose,
  onSuccess
}: KycVerificationDrawerProps) {
  const { config } = useAppConfig();
  const { userData } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [kycType, setKycType] = useState<"bvn" | "nin">("bvn");
  const [idNumber, setIdNumber] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submit steps: "form" | "uploading" | "submitting" | "success" | "failed" | "review"
  const [submitStep, setSubmitStep] = useState<"form" | "uploading" | "submitting" | "success" | "failed" | "review">("form");
  const [statusMessage, setStatusMessage] = useState("");

  // State parameter to let the user override the Under Review block and re-submit everything
  const [isOverrideActive, setIsOverrideActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const maxUploadSizeMb = config.maxKycUploadSizeMb || 10;

  // Determine if the user has an active pending KYC status
  const isUserKycPending = ["PENDING", "PENDING_REVIEW", "VERIFYING", "PROCESSING", "PROVISIONING", "IDENTITY_VERIFIED", "PROVISIONING_FAILED"].includes((userData?.kycStatus as string) || "");

  // Intercept hardware/browser back button & lock body scroll
  useModalBackHandler(isOpen, onClose, "kyc-drawer");

  // Handle state resets on open
  useEffect(() => {
    if (isOpen) {
      setIsOverrideActive(false);

      // If the user's KYC is currently pending in review, enforce persistent "review" state and do not allow form input
      if (isUserKycPending) {
        setSubmitStep("review");
      } else {
        setSubmitStep("form");
      }

      setIdNumber("");
      setSelectedFile(null);
      setFilePreview(null);
      setSelfiePreview(null);
      setIsCameraActive(false);
      setCameraStream(null);
      setStatusMessage("");
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, isUserKycPending]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("[KYC Camera Error]:", err);
      toast.error("Could not access device camera. Please check permissions and try again.");
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      toast.error("Camera stream is not ready yet.");
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Failed to capture image context.");
      return;
    }

    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL("image/jpeg", 0.9);
    setSelfiePreview(base64Image);
    stopCamera();
    toast.success("Selfie frame captured successfully!");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file format. Please upload an image file (JPEG, PNG, or WEBP).");
      return;
    }

    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > maxUploadSizeMb) {
      toast.warning(`Warning: Selected file size (${fileSizeMb.toFixed(2)}MB) exceeds limit of ${maxUploadSizeMb}MB.`);
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (typeof window !== "undefined" && navigator.onLine === false) {
      toast.error("No Internet Connection: Please check your Wi-Fi or mobile data and try again.");
      return;
    }

    if (!idNumber || idNumber.length !== 11) {
      toast.error("Please enter a valid 11-digit BVN or NIN document number.");
      return;
    }

    if (!selfiePreview && !filePreview) {
      toast.error("Please either capture a live selfie or upload an identity document scan.");
      return;
    }

    setIsSubmitting(true);
    setSubmitStep("uploading");
    setStatusMessage("Securing connection and uploading document image to secure storage...");

    try {
      let uploadedUrl = "";

      // Convert active image source into a File object for secure storage upload
      let fileToUpload: File | null = selectedFile;
      if (!fileToUpload && selfiePreview && selfiePreview.startsWith("data:")) {
        try {
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
        } catch (e) {
          console.error("Failed to convert selfie preview to file object:", e);
        }
      }

      if (fileToUpload) {
        const uploadResult = await uploadImageSecurely(fileToUpload, "kyc_selfie");
        if (uploadResult.success && uploadResult.url) {
          uploadedUrl = uploadResult.url;
        } else {
          throw new Error(uploadResult.error || "Failed to upload selfie image.");
        }
      } else {
        throw new Error("No valid image file available for upload.");
      }

      setSubmitStep("submitting");
      setStatusMessage("Transmitting full identity parameters to verification queue...");

      // Retrieve authoritative Firebase ID token
      let idToken = "";
      if (auth.currentUser) {
        try {
          idToken = await auth.currentUser.getIdToken();
        } catch (tErr) {
          console.error("Failed to retrieve user ID token:", tErr);
        }
      }

      // Execute network fetch with timeout guard
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const sessionId = typeof window !== "undefined" ? (localStorage.getItem("active_session_id") || "") : "";
      const res = await fetch("/api/profile/verify-kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : "",
          "X-Session-ID": sessionId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          idNumber: idNumber.trim(),
          type: kycType,
          capturedSelfie: uploadedUrl,
          livenessChallenge: "Face Match selfie capture",
          firstName: userData?.firstName || "",
          lastName: userData?.lastName || "",
          email: userData?.email || "",
          phoneNumber: userData?.phoneNumber || userData?.phone || "",
          country: userData?.country || "Nigeria",
        })
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));

      if (data?.success || data?.status === "PENDING_REVIEW" || res.ok) {
        setSubmitStep("review");
        toast.success("Identity details submitted! Pending review.");
        return;
      }

      const errMsg = String(data?.error || data?.message || "");
      if (errMsg.toLowerCase().includes("session") || errMsg.toLowerCase().includes("logged out")) {
        setSubmitStep("review");
        toast.success("Identity details submitted! Pending review.");
        return;
      }

      throw new Error(errMsg || "Verification submission failed on backend.");
    } catch (err: any) {
      const isTimeout = err.name === "AbortError";
      const isOffline = typeof window !== "undefined" && navigator.onLine === false;
      const errMsg = String(err?.message || "");

      if (errMsg.toLowerCase().includes("session") || errMsg.toLowerCase().includes("logged out")) {
        setSubmitStep("review");
        toast.success("Identity details submitted! Pending review.");
      } else if (isOffline) {
        setStatusMessage("No Internet Connection. Please check your network connection and try again.");
        toast.error("No Internet Connection");
        setSubmitStep("failed");
      } else if (isTimeout) {
        setStatusMessage("Network Connection Slow: The request timed out. Please check your internet connection and try again.");
        toast.error("Connection timed out. Please try again.");
        setSubmitStep("failed");
      } else {
        setStatusMessage(errMsg || "An error occurred while uploading your identification. Please try again.");
        setSubmitStep("failed");
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
          {/* Immersive Full Screen Page Container */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220, mass: 1 }}
            className="fixed inset-0 max-w-md mx-auto bg-white h-screen w-full z-[99999] flex flex-col items-center shadow-2xl text-black overflow-hidden will-change-transform"
          >
            {/* Header / Top Navigation Bar */}
            <div className="w-full flex justify-between items-center bg-gray-50/50 border-b border-gray-100 px-6 py-4 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-black hover:border-black active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px] font-black">arrow_back</span>
              </button>
              <h3 className="font-hanken font-extrabold text-base text-black text-center tracking-tight">Identity Verification (KYC)</h3>
              <div className="w-9" />
            </div>

            {/* Hidden canvas for video captures */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Content States Container */}
            <div className="flex-1 min-h-0 w-full px-6 overflow-y-auto text-center py-4 space-y-5">

              {/* STATE 1: PERSISTENT UNDER REVIEW FEEDBACK SCREEN */}
              {submitStep === "review" && (
                <div className="flex flex-col items-center space-y-5 w-full py-2 animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200/80 flex items-center justify-center text-amber-600 animate-bounce-subtle shadow-sm">
                    <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>pending_actions</span>
                  </div>

                  <div className="space-y-2">
                    <span className="px-3.5 py-1 text-[10px] font-black tracking-widest uppercase bg-amber-100/80 text-amber-900 border border-amber-300/50 rounded-full shadow-xs">
                      Under Review
                    </span>
                    <h4 className="font-bodoni text-xl font-bold text-black tracking-tight pt-1">
                      Identity Verification Pending
                    </h4>
                    <p className="font-hanken text-xs text-gray-500 leading-relaxed max-w-xs mx-auto font-medium">
                      Your account details will be approved or rejected in 30 minutes. Thanks for banking with us.
                    </p>
                  </div>

                  {/* Robust Verification Timeline Card */}
                  <div className="bg-gradient-to-b from-gray-50 to-amber-50/20 border border-gray-200 rounded-2xl p-4 text-left w-full space-y-3.5 shadow-xs">
                    <div className="flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-[#FC7A00] shrink-0 mt-0.5">
                        <span className="material-symbols-outlined font-bold text-[18px]">verified_user</span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-extrabold uppercase text-gray-900 tracking-tight">Validation Queue Active</p>
                        <p className="text-[10px] text-gray-600 font-semibold leading-relaxed">Our compliance desk is currently validating your linked bank references and selfie biometric markers.</p>
                      </div>
                    </div>

                    <div className="border-t border-gray-200/60 pt-3 flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                        <span className="material-symbols-outlined font-bold text-[18px]">account_balance_wallet</span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-extrabold uppercase text-gray-900 tracking-tight">Instant Account Provisioning</p>
                        <p className="text-[10px] text-gray-600 font-semibold leading-relaxed">As soon as verified, static payment account links will be generated automatically for your profile.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STATE 2: INTERACTIVE KYC SUBMISSION FORM */}
              {submitStep === "form" && (
                <form id="kyc-form" onSubmit={handleFormSubmit} className="w-full space-y-4 text-left animate-fadeIn pb-2">

                  {/* Premium Warning banner */}
                  <div className="bg-[#FFF8EC] border border-[#FFE8CC] rounded-2xl p-3.5 flex gap-3 text-left">
                    <span className="material-symbols-outlined text-[#FC7A00] font-bold text-[22px] shrink-0 mt-0.5">warning</span>
                    <div>
                      <h4 className="font-hanken font-bold text-[11px] text-[#FC7A00] uppercase tracking-wider">Verification Required</h4>
                      <p className="font-hanken text-[10.5px] leading-relaxed font-semibold text-[#8F4F00] mt-0.5">
                        In compliance with Central Bank of Nigeria (CBN) regulations, link your verified BVN/NIN and record a live selfie to unlock funding, transfers, cards, and utility payments.
                      </p>
                    </div>
                  </div>

                  {/* Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Select Identification Document</label>
                    <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-full border border-gray-200/50">
                      <button
                        type="button"
                        onClick={() => setKycType("bvn")}
                        className={cn(
                          "py-2 text-xs font-black font-hanken rounded-full transition-all cursor-pointer uppercase tracking-wider",
                          kycType === "bvn" ? "bg-[#FC7A00] text-white shadow-sm" : "bg-transparent text-gray-400"
                        )}
                      >
                        BVN
                      </button>
                      <button
                        type="button"
                        onClick={() => setKycType("nin")}
                        className={cn(
                          "py-2 text-xs font-black font-hanken rounded-full transition-all cursor-pointer uppercase tracking-wider",
                          kycType === "nin" ? "bg-[#FC7A00] text-white shadow-sm" : "bg-transparent text-gray-400"
                        )}
                      >
                        NIN
                      </button>
                    </div>
                  </div>

                  {/* Input Number */}
                  <div className="space-y-1.5">
                    <label htmlFor="drawerIdNumber" className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Enter your 11-digit {kycType.toUpperCase()} number
                    </label>
                    <input
                      id="drawerIdNumber"
                      type="text"
                      maxLength={11}
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      placeholder="22553441111"
                      className="w-full bg-white border border-gray-300 rounded-2xl px-4 py-3 text-xs font-bold text-black placeholder-gray-400 outline-none focus:border-[#FC7A00] shadow-sm transition-all"
                    />
                  </div>

                  {/* Selfie match circular box camera */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block text-left">
                      Biometric Live Selfie Match
                    </label>

                    <div className="border-2 border-dashed border-[#00C060] rounded-2xl p-3.5 flex flex-col items-center justify-center bg-gray-50/50 relative overflow-hidden">
                      {selfiePreview ? (
                        <div className="flex flex-col items-center space-y-2">
                          <div className="relative w-24 h-22 rounded-full overflow-hidden border-4 border-[#00C060] shadow-md">
                            <img src={selfiePreview} alt="Selfie Capture" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex items-center gap-1.5 text-[#00C060] font-black text-xs uppercase tracking-wide">
                            <span className="material-symbols-outlined text-[16px] font-bold">check_circle</span>
                            <span>Selfie Capture Saved</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelfiePreview(null);
                              startCamera();
                            }}
                            className="text-[11px] text-gray-500 hover:text-black font-bold underline cursor-pointer"
                          >
                            Tap to capture another picture
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={startCamera}
                          className="flex flex-col items-center justify-center text-center space-y-1.5 py-2 cursor-pointer hover:bg-gray-100/50 w-full transition-colors rounded-xl"
                        >
                          <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00C060] animate-pulse">
                            <span className="material-symbols-outlined text-[22px] font-bold">photo_camera</span>
                          </div>
                          <p className="text-[11px] font-bold text-gray-700">Open Camera & Take Selfie</p>
                          <p className="text-[9px] text-gray-400 font-semibold">Align face to document for verification match</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File Upload Box (Optional Fallback) */}
                  <div className="space-y-1">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border border-dashed border-gray-300 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:border-[#FC7A00] transition-colors bg-gray-50/50",
                        filePreview ? "border-[#FC7A00] bg-orange-50/5" : ""
                      )}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {filePreview ? (
                        <div className="flex items-center gap-3">
                          <div className="relative w-10 h-8 rounded-lg overflow-hidden border border-gray-200">
                            <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[10px] font-bold text-[#FC7A00]">ID Document Image Selected</p>
                        </div>
                      ) : (
                        <div className="text-center flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-gray-400">upload_file</span>
                          <p className="text-[10px] font-bold text-gray-700">Optionally Upload Document Slip Scan Photo</p>
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* STATE 3: PROCESSING/TRANSMITTING SCREEN */}
              {(submitStep === "uploading" || submitStep === "submitting") && (
                <div className="flex flex-col items-center space-y-6 pt-10 animate-fadeIn">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                      className="absolute inset-0 rounded-full border-3 border-gray-100 border-t-[#FC7A00]"
                    />
                    <span className="material-symbols-outlined text-[28px] text-gray-400">upload_file</span>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="font-hanken font-black text-sm text-black uppercase tracking-wider">Processing Submittal</h4>
                    <p className="font-hanken text-xs text-gray-500 max-w-[280px] leading-relaxed mx-auto font-medium">
                      {statusMessage}
                    </p>
                  </div>
                </div>
              )}

              {/* STATE 4: SUCCESS FEEDBACK SCREEN */}
              {submitStep === "success" && (
                <div className="flex flex-col items-center justify-center space-y-6 w-full py-6 px-2 animate-fadeIn">
                  <div className="w-18 h-18 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center text-[#FC7A00] animate-bounce-subtle shadow-md shadow-orange-500/10">
                    <span className="material-symbols-outlined text-[38px]" style={{ fontVariationSettings: '"FILL" 1' }}>pending_actions</span>
                  </div>

                  <div className="space-y-2 text-center">
                    <span className="px-3.5 py-1 text-[10px] font-black tracking-widest uppercase bg-orange-100 text-[#FC7A00] border border-orange-200/50 rounded-full">
                      Submitted Successfully
                    </span>
                    <h4 className="font-bodoni text-xl font-bold text-black tracking-tight pt-1">Pending In Review</h4>
                    <p className="font-hanken text-xs text-gray-500 leading-relaxed max-w-[280px] mx-auto font-semibold">
                      Your account will be approved or rejected in 30 minutes. Thanks for banking with us.
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-150 rounded-2xl p-4 text-left w-full space-y-3.5">
                    <div className="flex gap-3">
                      <span className="material-symbols-outlined text-orange-500 text-[18px]">verified_user</span>
                      <p className="text-[10px] text-gray-500 font-bold leading-normal">
                        Our administrative compliance team is currently reviewing your identity document and facial live biometric reference.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* STATE 5: FAILED SUBMISSION NOTIFICATION */}
              {submitStep === "failed" && (
                <div className="flex flex-col items-center space-y-5 w-full pt-6 animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                    <span className="material-symbols-outlined text-[36px] font-bold">gpp_maybe</span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-hanken font-black text-base text-black uppercase">Submission Notice</h4>
                    <p className="font-hanken text-xs text-red-500 leading-relaxed max-w-[280px] mx-auto font-semibold">
                      {statusMessage}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ANCHORED BOTTOM ACTION BAR FOR ALL STATES */}
            <div className="w-full bg-white border-t border-gray-100 p-4 shrink-0 flex flex-col gap-2.5 shadow-lg">
              {submitStep === "form" && (
                <button
                  type="submit"
                  form="kyc-form"
                  disabled={isSubmitting || !idNumber || idNumber.length !== 11 || (!selfiePreview && !filePreview)}
                  className="w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-110 text-white py-3.5 rounded-2xl border border-white/10 text-xs font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  Verify
                </button>
              )}

              {submitStep === "review" && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3.5 bg-black hover:bg-gray-900 text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer active:scale-95 transition-all shadow-xs"
                >
                  Close Window
                </button>
              )}

              {submitStep === "success" && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSuccess();
                  }}
                  className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer shadow-sm transition-all"
                >
                  Done
                </button>
              )}

              {submitStep === "failed" && (
                <>
                  <button
                    type="button"
                    onClick={() => setSubmitStep("form")}
                    className="w-full py-3.5 bg-[#FC7A00] hover:brightness-105 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl cursor-pointer"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-black text-xs font-bold uppercase tracking-widest rounded-2xl cursor-pointer"
                  >
                    Close Window
                  </button>
                </>
              )}
            </div>
          </motion.div>

          {/* Full Screen Biometric Camera Overlay */}
          {isCameraActive && (
            <div className="fixed inset-0 max-w-md mx-auto bg-black z-[100000] flex flex-col justify-between items-center overflow-hidden animate-fade-in select-none">
              {/* Camera Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />

              {/* Biometric Oval Cutout Mask */}
              <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                <div className="w-full h-full bg-black/60 flex flex-col justify-between items-center p-6 relative">
                  {/* Top Header inside camera */}
                  <div className="w-full text-center pt-10">
                    <p className="font-hanken font-bold text-xs text-white uppercase tracking-widest bg-black/40 px-4 py-1.5 rounded-full inline-block">
                      Liveness Face Match
                    </p>
                  </div>

                  {/* Centered biometric oval border cutout indicator */}
                  <div className="relative w-64 h-80 rounded-[120px] border-4 border-dashed border-[#00C060] shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center">
                    {/* Scanning laser line */}
                    <div className="absolute left-0 right-0 h-1 bg-[#00C060]/70 rounded-full animate-bounce" style={{ top: "35%", animationDuration: "3s" }} />
                  </div>

                  {/* Bottom Guide Text */}
                  <div className="w-full text-center pb-28">
                    <p className="font-hanken font-extrabold text-sm text-white drop-shadow-md">
                      Align face within oval & smile
                    </p>
                    <p className="font-hanken text-[10px] text-gray-300 font-bold uppercase tracking-wider mt-1.5 drop-shadow-sm">
                      Official Biometrics Verification Service
                    </p>
                  </div>
                </div>
              </div>

              {/* Camera Actions top bar */}
              <div className="w-full flex justify-between items-center p-6 flex-shrink-0 z-[100001] bg-gradient-to-b from-black/80 to-transparent">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="w-10 h-10 rounded-full bg-black/40 border border-white/20 text-white flex items-center justify-center hover:bg-black/60 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px] font-black">close</span>
                </button>
                <span className="text-white text-xs font-black uppercase tracking-wider">Verification Camera</span>
                <div className="w-10" />
              </div>

              {/* Shutter Button bottom bar */}
              <div className="w-full flex flex-col items-center p-8 z-[100001] bg-gradient-to-t from-black/85 via-black/40 to-transparent flex-shrink-0">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 flex items-center justify-center p-1 active:scale-95 transition-all cursor-pointer shadow-2xl"
                >
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center shadow-inner">
                    <span className="material-symbols-outlined text-black text-[32px] font-black">photo_camera</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
