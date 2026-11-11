"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { triggerHaptic } from "@/lib/haptics";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";

function maskBvnNin(val?: unknown): string {
  if (!val) return "";
  const clean = String(val).trim();
  if (clean.length < 5) return clean;
  return `${clean.slice(0, 3)}******${clean.slice(-2)}`;
}

interface TransferLimitsSectionProps {
  dailyLimit?: number;
}

export function TransferLimitsSection({ dailyLimit = 500000 }: TransferLimitsSectionProps) {
  const { userData, user } = useAuth();
  const [isDrawerOpen, setIsModalDrawerOpen] = useState(false);
  const [upgradeRequest, setUpgradeRequest] = useState<any>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);

  const { config } = useAppConfig();
  const currentTier = String(userData?.tier || (userData?.kycStatus === "VERIFIED" ? "Tier 2" : "Tier 1"));

  const hasCustom = userData?.hasCustomLimits === true;

  const singleLimit = (hasCustom && Number(userData?.singleLimit) > 0) ? Number(userData.singleLimit) : (
    currentTier === "Tier 3"
      ? (config?.tier3SingleTransferLimit ?? config?.tier3SingleLimit ?? 10000000)
      : currentTier === "Tier 2"
      ? (config?.tier2SingleTransferLimit ?? config?.tier2SingleLimit ?? 2000000)
      : (config?.tier1SingleTransferLimit ?? 200000)
  );

  const numDailyLimit = (hasCustom && Number(userData?.dailyTransferLimit ?? userData?.dailyLimit) > 0) ? Number(userData.dailyTransferLimit ?? userData.dailyLimit) : (
    currentTier === "Tier 3"
      ? (config?.tier3DailyTransferLimit ?? config?.tier3DailyLimit ?? 50000000)
      : currentTier === "Tier 2"
      ? (config?.tier2DailyTransferLimit ?? config?.tier2DailyLimit ?? 5000000)
      : (config?.tier1DailyTransferLimit ?? 500000)
  );

  // Modal back button interception
  useModalBackHandler(isDrawerOpen, () => setIsModalDrawerOpen(false), "tier-upgrade-drawer");

  // Fetch active upgrade request state on mount and drawer open
  const fetchUpgradeRequest = async () => {
    if (!user) return;
    setIsLoadingRequest(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/profile/tier-upgrade", {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpgradeRequest(data.request);
      }
    } catch (err) {
      console.warn("Failed to load tier upgrade request:", err);
    } finally {
      setIsLoadingRequest(false);
    }
  };

  useEffect(() => {
    fetchUpgradeRequest();
  }, [user]);

  return (
    <section className="premium-gradient-card premium-gradient-border p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100/60 pb-3">
        <div>
          <h3 className="font-hanken font-extrabold text-xs tracking-wider uppercase text-gray-500">
            Current Tier & Transfer Limits
          </h3>
          <p className="font-hanken text-[10px] text-gray-400 mt-0.5 font-semibold">Your authorized account level and transaction limits</p>
        </div>

        <span className={cn(
          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-2xs flex items-center gap-1",
          currentTier === "Tier 3"
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : currentTier === "Tier 2"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-gray-100 text-gray-700 border-gray-200"
        )}>
          <span className="material-symbols-outlined text-[14px]">workspace_premium</span>
          {currentTier}
        </span>
      </div>

      {/* Limits Metrics Breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50/80 border border-gray-150 rounded-2xl p-3.5 space-y-1">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 block">Daily Limit</span>
          <p className="font-hanken font-black text-base text-gray-900">
            ₦{new Intl.NumberFormat("en-NG").format(numDailyLimit)}
          </p>
        </div>

        <div className="bg-gray-50/80 border border-gray-150 rounded-2xl p-3.5 space-y-1">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400 block">Single Transfer Limit</span>
          <p className="font-hanken font-black text-base text-gray-900">
            ₦{new Intl.NumberFormat("en-NG").format(singleLimit)}
          </p>
        </div>
      </div>

      {/* Request Tier Upgrade Action Trigger */}
      <div className="pt-1">
        {upgradeRequest?.status === "PENDING" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-amber-600 text-[20px] font-bold animate-bounce-subtle">pending_actions</span>
              <div>
                <p className="text-[11px] font-black uppercase text-amber-900 tracking-tight">Upgrade Request Under Review</p>
                <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Target: {upgradeRequest.targetTier || "Tier 2"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { triggerHaptic(); setIsModalDrawerOpen(true); }}
              className="text-[10px] font-black uppercase tracking-wider text-amber-900 underline cursor-pointer"
            >
              Inspect
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { triggerHaptic(); setIsModalDrawerOpen(true); }}
            className="w-full py-3.5 bg-black hover:bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">upgrade</span>
            <span>REQUEST TIER UPGRADE</span>
          </button>
        )}
      </div>

      {/* Tier Upgrade Drawer Modal */}
      <TierUpgradeDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsModalDrawerOpen(false)}
        upgradeRequest={upgradeRequest}
        onRequestSubmitted={() => {
          fetchUpgradeRequest();
        }}
      />
    </section>
  );
}

export interface TierUpgradeDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgradeRequest?: any;
  onRequestSubmitted: () => void;
}

export function TierUpgradeDrawerModal({
  isOpen,
  onClose,
  upgradeRequest,
  onRequestSubmitted,
}: TierUpgradeDrawerModalProps) {
  const { userData, user } = useAuth();
  const { config } = useAppConfig();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Modal Back Handler for drawer
  useModalBackHandler(isOpen, onClose, "tier-upgrade-full-drawer");

  // Form inputs auto-filled from userData
  const [fullName, setFullName] = useState("");
  const [bvn, setBvn] = useState("");
  const [targetTier, setTargetTier] = useState<"Tier 2" | "Tier 3">("Tier 2");

  // Acceptable IDs from app config
  const acceptableIds = Array.isArray(config?.acceptableGovernmentIds) && config.acceptableGovernmentIds.length > 0
    ? config.acceptableGovernmentIds
    : ["National ID Card (NIN)", "International Passport", "Driver's License", "Voter's Card"];

  // Government ID file uploader
  const [governmentIdType, setGovernmentIdType] = useState<string>(acceptableIds[0] || "National ID Card (NIN)");
  const [governmentIdFile, setGovernmentIdFile] = useState<File | null>(null);
  const [governmentIdPreview, setGovernmentIdPreview] = useState<string | null>(null);
  const governmentIdInputRef = useRef<HTMLInputElement>(null);

  // Proof of Address file uploader
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [addressPreview, setAddressPreview] = useState<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Live Selfie camera/file uploader
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Guidance / Sample Modal state
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 4-Digit Transaction PIN verification state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [is2faStage, setIs2faStage] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState("");

  useModalBackHandler(isPinModalOpen, () => setIsPinModalOpen(false), "tier-upgrade-pin-modal");

  useEffect(() => {
    if (isOpen) {
      setIsPinModalOpen(false);
      setPinDigits(["", "", "", ""]);
      const nameVal = userData?.name || user?.displayName || "";
      setFullName(typeof nameVal === "string" ? nameVal : String(nameVal || ""));

      const bvnVal = userData?.bvn || userData?.nin || "";
      setBvn(typeof bvnVal === "string" ? bvnVal : String(bvnVal || ""));

      setGovernmentIdFile(null);
      setGovernmentIdPreview(null);
      setGovernmentIdType(acceptableIds[0] || "National ID Card (NIN)");
      setAddressFile(null);
      setAddressPreview(null);
      setSelfieFile(null);
      setSelfiePreview(null);
      setIsSampleModalOpen(false);
    }
  }, [isOpen, userData, user]);

  const handleGovernmentIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    triggerHaptic();
    const file = e.target.files?.[0];
    if (!file) return;
    setGovernmentIdFile(file);
    if (governmentIdPreview && governmentIdPreview.startsWith("blob:")) {
      URL.revokeObjectURL(governmentIdPreview);
    }
    setGovernmentIdPreview(URL.createObjectURL(file));
  };

  const handleAddressFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    triggerHaptic();
    const file = e.target.files?.[0];
    if (!file) return;
    setAddressFile(file);
    if (addressPreview && addressPreview.startsWith("blob:")) {
      URL.revokeObjectURL(addressPreview);
    }
    setAddressPreview(URL.createObjectURL(file));
  };

  const handleSelfieFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    triggerHaptic();
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    if (selfiePreview && selfiePreview.startsWith("blob:")) {
      URL.revokeObjectURL(selfiePreview);
    }
    setSelfiePreview(URL.createObjectURL(file));
  };

  const handlePreSubmitValidation = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic();

    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }

    if (!bvn || bvn.trim().length !== 11) {
      toast.error("Please enter a valid 11-digit BVN or NIN number.");
      return;
    }

    if (!governmentIdFile && !governmentIdPreview) {
      toast.error("Government ID card scan or picture is required.");
      return;
    }

    if (!addressFile && !addressPreview) {
      toast.error("Proof of address document scan is required.");
      return;
    }

    if (!selfieFile && !selfiePreview) {
      toast.error("Live selfie picture is required.");
      return;
    }

    // Open 4-digit PIN verification modal
    setPinDigits(["", "", "", ""]);
    setIs2faStage(false);
    setVerifiedPin("");
    setIsPinModalOpen(true);
  };

  const handlePinDigitPress = (digit: string) => {
    triggerHaptic();
    const emptyIdx = pinDigits.findIndex((d) => d === "");
    if (emptyIdx !== -1) {
      const updated = [...pinDigits];
      updated[emptyIdx] = digit;
      setPinDigits(updated);

      if (emptyIdx === 3) {
        const fullPin = updated.join("");
        if (userData?.is2faOtpEnabled === true) {
          setVerifiedPin(fullPin);
          setIs2faStage(true);
        } else {
          executeVerifiedSubmit(fullPin);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    triggerHaptic();
    const lastFilledIdx = pinDigits.map((d) => d !== "").lastIndexOf(true);
    if (lastFilledIdx !== -1) {
      const updated = [...pinDigits];
      updated[lastFilledIdx] = "";
      setPinDigits(updated);
    }
  };

  const handlePinClear = () => {
    triggerHaptic();
    setPinDigits(["", "", "", ""]);
  };

  const executeVerifiedSubmit = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    toast.loading("Verifying transaction PIN...");

    try {
      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      // 1. Verify 4-digit Transaction PIN first
      const verifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin: enteredPin }),
      });

      const verifyData = await verifyRes.json();
      toast.dismiss();

      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Invalid 4-digit Transaction PIN. Request aborted.");
        setPinDigits(["", "", "", ""]);
        setIsVerifyingPin(false);
        return;
      }

      setIsPinModalOpen(false);
      setIsSubmitting(true);
      toast.loading("Uploading documents & submitting upgrade request...");

      // 2. Upload Government ID
      let govIdUrl = governmentIdPreview || "";
      if (governmentIdFile) {
        const govUpload = await uploadImageSecurely(governmentIdFile, "kyc_document");
        if (govUpload.success && govUpload.url) {
          govIdUrl = govUpload.url;
        } else {
          throw new Error(govUpload.error || "Failed to upload Government ID document.");
        }
      }

      // 3. Upload Proof of Address
      let proofUrl = addressPreview || "";
      if (addressFile) {
        const addressUpload = await uploadImageSecurely(addressFile, "kyc_document");
        if (addressUpload.success && addressUpload.url) {
          proofUrl = addressUpload.url;
        } else {
          throw new Error(addressUpload.error || "Failed to upload proof of address document.");
        }
      }

      // 4. Upload Live Selfie
      let liveSelfieUrl = selfiePreview || "";
      if (selfieFile) {
        const selfieUpload = await uploadImageSecurely(selfieFile, "kyc_selfie");
        if (selfieUpload.success && selfieUpload.url) {
          liveSelfieUrl = selfieUpload.url;
        } else {
          throw new Error(selfieUpload.error || "Failed to upload selfie image.");
        }
      }

      // 5. Post payload to backend
      const res = await fetch("/api/profile/tier-upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          bvn: bvn.trim(),
          governmentIdUrl: govIdUrl,
          governmentIdType,
          proofOfAddressUrl: proofUrl,
          selfieUrl: liveSelfieUrl,
          targetTier,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Tier upgrade request submitted successfully!");
        onRequestSubmitted();
        onClose();
      } else {
        toast.error(data.error || "Failed to submit upgrade request.");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "An error occurred during submission.");
    } finally {
      setIsSubmitting(false);
      setIsVerifyingPin(false);
    }
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99998]"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
            className="fixed inset-0 w-full h-full bg-white z-[100000] flex flex-col justify-between overflow-hidden p-6 pb-8 text-black"
          >
            {/* Full-Screen Top Header Bar */}
            <div className="w-full flex items-center gap-3 border-b border-gray-100 pb-4 mb-2 shrink-0">
              <button
                type="button"
                onClick={() => { triggerHaptic(); onClose(); }}
                className="w-10 h-10 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-100 transition-all cursor-pointer active:scale-95 shrink-0"
                title="Back"
              >
                <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
              </button>

              <div className="text-left flex-1 min-w-0">
                <h3 className="font-hanken font-black text-base text-black uppercase tracking-wider truncate">
                  UPGRADE LIMITS
                </h3>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 truncate">Submit verification documents to unlock higher limits</p>
              </div>
            </div>

            {/* Content Body */}
            {upgradeRequest?.status === "PENDING" ? (
              <div className="flex-1 overflow-y-auto space-y-5 text-center py-4">
                <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-amber-600 mx-auto animate-bounce-subtle">
                  <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                    pending_actions
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="px-3.5 py-1 text-[10px] font-black tracking-widest uppercase bg-amber-100 text-amber-900 border border-amber-300 rounded-full">
                    Under Review
                  </span>
                  <h4 className="font-bodoni text-xl font-bold text-black tracking-tight pt-1">
                    Upgrade Request Pending
                  </h4>
                  <p className="font-hanken text-xs text-gray-500 leading-relaxed max-w-xs mx-auto font-medium">
                    Your request to upgrade to <strong className="text-black">{upgradeRequest.targetTier || "Tier 2"}</strong> is under administrative review.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left space-y-2.5 text-xs font-semibold">
                  <div className="flex justify-between border-b pb-2 border-gray-200/60">
                    <span className="text-gray-400">Full Name</span>
                    <span className="text-black font-extrabold">{upgradeRequest.fullName}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 border-gray-200/60">
                    <span className="text-gray-400">BVN / NIN</span>
                    <span className="text-black font-mono font-bold">{upgradeRequest.bvn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Submitted On</span>
                    <span className="text-gray-700 font-mono text-[11px]">
                      {new Date(upgradeRequest.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <form id="tier-upgrade-form" onSubmit={handlePreSubmitValidation} className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-2 text-left">

                {/* Target Tier Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    {config?.tierUpgradeSelectionTitle || "SELECT TARGET UPGRADE TIER"}
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100/80 rounded-2xl border border-gray-200/80">
                    <button
                      type="button"
                      onClick={() => { triggerHaptic(); setTargetTier("Tier 2"); }}
                      className={cn(
                        "py-3 rounded-xl transition-all cursor-pointer uppercase tracking-wider flex flex-col items-center justify-center border",
                        targetTier === "Tier 2"
                          ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-xs font-black"
                          : "bg-transparent border-transparent text-gray-600 hover:text-black font-extrabold"
                      )}
                    >
                      <span className="text-xs">Tier 2</span>
                      <span className="text-[9.5px] opacity-90 font-mono font-bold mt-0.5">
                        ₦{new Intl.NumberFormat("en-NG").format(config?.tier2DailyLimit ?? 5000000)} / DAY
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { triggerHaptic(); setTargetTier("Tier 3"); }}
                      className={cn(
                        "py-3 rounded-xl transition-all cursor-pointer uppercase tracking-wider flex flex-col items-center justify-center border",
                        targetTier === "Tier 3"
                          ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-xs font-black"
                          : "bg-transparent border-transparent text-gray-600 hover:text-black font-extrabold"
                      )}
                    >
                      <span className="text-xs">Tier 3</span>
                      <span className="text-[9.5px] opacity-90 font-mono font-bold mt-0.5">
                        ₦{new Intl.NumberFormat("en-NG").format(config?.tier3DailyLimit ?? 50000000)} / DAY
                      </span>
                    </button>
                  </div>
                </div>

                {/* Auto-filled Full Name (Read-Only / Muted) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Full Name (Auto-filled)</label>
                  <input
                    type="text"
                    required
                    readOnly
                    disabled
                    value={fullName}
                    className="w-full bg-gray-100/80 border border-gray-200 text-gray-500 rounded-2xl px-4 py-3 text-xs font-extrabold cursor-not-allowed select-none outline-none"
                  />
                </div>

                {/* BVN / NIN Input (Masked & Read-only if linked) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      BVN / NIN Number
                    </label>
                    {Boolean(userData?.bvn || userData?.nin) && (
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span className="material-symbols-outlined text-[13px]">lock</span>
                        Linked &amp; Verified
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    readOnly={Boolean(userData?.bvn || userData?.nin)}
                    disabled={Boolean(userData?.bvn || userData?.nin)}
                    value={Boolean(userData?.bvn || userData?.nin) ? maskBvnNin(userData?.bvn || userData?.nin) : bvn}
                    onChange={(e) => {
                      if (!userData?.bvn && !userData?.nin) {
                        setBvn(e.target.value.replace(/\D/g, "").slice(0, 11));
                      }
                    }}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-xs font-mono font-bold outline-none border transition-all",
                      Boolean(userData?.bvn || userData?.nin)
                        ? "bg-gray-100/80 border-gray-200 text-gray-500 cursor-not-allowed select-none"
                        : "bg-gray-50 border-gray-200 text-black focus:border-[#FC7A00]"
                    )}
                  />
                </div>

                {/* Upload Government ID Card */}
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      Government ID Card *
                    </label>
                    <button
                      type="button"
                      onClick={() => { triggerHaptic(); setIsSampleModalOpen(true); }}
                      className="text-[10px] font-bold text-[#FC7A00] flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      View Upload Samples &amp; Guidance
                    </button>
                  </div>

                  {/* Acceptable ID Type Selector */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-extrabold uppercase text-gray-400">Select Document Type:</label>
                    <select
                      value={governmentIdType}
                      onChange={(e) => { triggerHaptic(); setGovernmentIdType(e.target.value); }}
                      className="w-full bg-gray-50 border border-gray-200 text-black rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-[#FC7A00] cursor-pointer"
                    >
                      {acceptableIds.map((idName) => (
                        <option key={idName} value={idName}>{idName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Government ID Dropzone */}
                  <input
                    type="file"
                    ref={governmentIdInputRef}
                    accept="image/*"
                    onChange={handleGovernmentIdFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => { triggerHaptic(); governmentIdInputRef.current?.click(); }}
                    className={cn(
                      "p-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/50 hover:bg-gray-100/50",
                      governmentIdPreview ? "border-emerald-500 bg-emerald-50/20" : "border-gray-300 hover:border-[#FC7A00]"
                    )}
                  >
                    {governmentIdPreview ? (
                      <div className="flex items-center gap-3 w-full">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-emerald-300 shrink-0 shadow-xs">
                          <img src={governmentIdPreview} alt="Gov ID" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-black text-emerald-800 truncate">
                            {governmentIdType} Uploaded
                          </p>
                          <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                            {governmentIdFile ? `${(governmentIdFile.size / 1024 / 1024).toFixed(2)} MB • Ready for submission` : "Uploaded ID Attached"}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-emerald-600 font-bold text-xl">check_circle</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-left py-1">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-[#FC7A00] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[22px]">badge</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">Upload Front Photo of {governmentIdType}</p>
                          <p className="text-[10px] font-semibold text-gray-400 mt-0.5">JPEG, PNG, WEBP scan showing details clearly</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Proof of Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Proof of Address Document *</label>
                  <input
                    type="file"
                    ref={addressInputRef}
                    accept="image/*"
                    onChange={handleAddressFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => { triggerHaptic(); addressInputRef.current?.click(); }}
                    className={cn(
                      "p-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/50 hover:bg-gray-100/50",
                      addressPreview ? "border-emerald-500 bg-emerald-50/20" : "border-gray-300 hover:border-[#FC7A00]"
                    )}
                  >
                    {addressPreview ? (
                      <div className="flex items-center gap-3 w-full">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-emerald-300 shrink-0 shadow-xs">
                          <img src={addressPreview} alt="Address Doc" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-black text-emerald-800 truncate">
                            {addressFile?.name || "Proof of Address Scan Attached"}
                          </p>
                          <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                            {addressFile ? `${(addressFile.size / 1024 / 1024).toFixed(2)} MB • Ready for submission` : "Uploaded Scan Attached"}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-emerald-600 font-bold text-xl">check_circle</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-left py-1">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-[#FC7A00] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[22px]">upload_file</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">Upload Utility Bill or Bank Statement</p>
                          <p className="text-[10px] font-semibold text-gray-400 mt-0.5">JPEG, PNG, WEBP scan showing physical address</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Live Selfie */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Live Biometric Selfie Picture *</label>
                  <input
                    type="file"
                    ref={selfieInputRef}
                    accept="image/*"
                    capture="user"
                    onChange={handleSelfieFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => { triggerHaptic(); selfieInputRef.current?.click(); }}
                    className={cn(
                      "p-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all bg-gray-50/50 hover:bg-gray-100/50",
                      selfiePreview ? "border-emerald-500 bg-emerald-50/20" : "border-gray-300 hover:border-[#FC7A00]"
                    )}
                  >
                    {selfiePreview ? (
                      <div className="flex items-center gap-3 w-full">
                        <div className="relative w-12 h-12 rounded-full border-2 border-emerald-500 overflow-hidden shrink-0 shadow-xs">
                          <img src={selfiePreview} alt="Selfie" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-black text-emerald-800 truncate">
                            Biometric Live Selfie Attached
                          </p>
                          <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                            Face match oval capture verified
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-emerald-600 font-bold text-xl">check_circle</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-left py-1">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[22px]">photo_camera</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">Take or Upload Biometric Selfie</p>
                          <p className="text-[10px] font-semibold text-gray-400 mt-0.5">Align face clearly in frame for live biometric check</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </form>
            )}

            {/* Anchored Bottom Action Bar */}
            <div className="pt-3 border-t border-gray-100 shrink-0 bg-white">
              {upgradeRequest?.status === "PENDING" ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3.5 bg-black text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer"
                >
                  Close Window
                </button>
              ) : (
                <button
                  type="submit"
                  form="tier-upgrade-form"
                  disabled={isSubmitting || (!addressFile && !addressPreview) || (!selfieFile && !selfiePreview)}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer hover:brightness-105 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting Request..." : "Submit Upgrade Request"}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* Government ID Guidance & Upload Sample Modal */}
      <AnimatePresence>
        {isSampleModalOpen && (
          <div className="fixed inset-0 z-[100005] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-3xl p-6 text-left shadow-2xl space-y-4 border border-gray-100 font-hanken text-black max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">verified</span>
                  <h4 className="font-extrabold text-sm uppercase text-gray-900">ID Upload Sample &amp; Guidance</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSampleModalOpen(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              {/* Guidance Checklist */}
              <div className="space-y-3">
                <p className="text-xs text-gray-600 font-medium leading-relaxed">
                  To ensure fast approval of your limit upgrade request, please upload a clear, legible photograph or scan of your government-issued identification document.
                </p>

                <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-2 text-xs">
                  <p className="font-extrabold text-[#FC7A00] text-[11px] uppercase tracking-wider">Acceptable Government IDs:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-bold text-gray-800 text-[11px]">
                    {acceptableIds.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-emerald-600">check_circle</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <p className="font-extrabold text-xs uppercase tracking-wider text-gray-900">Upload Guidelines &amp; Sample:</p>

                  <div className="border border-gray-200 rounded-2xl p-3 bg-gray-50 space-y-2">
                    <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-tr from-gray-900/80 via-gray-800/60 to-gray-900/80 flex flex-col items-center justify-center p-3 text-white text-center">
                        <span className="material-symbols-outlined text-[36px] text-emerald-400">badge</span>
                        <p className="font-mono font-extrabold text-xs uppercase tracking-wider mt-1 text-emerald-300">VALID GOVERNMENT ID</p>
                        <p className="text-[10px] text-gray-300 font-semibold">Name, photo, ID number, and expiration date strictly legible</p>
                      </div>
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-gray-700 font-semibold">
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check</span>
                      <span><strong>All 4 Corners Visible:</strong> Ensure the entire card is inside the photo frame without cutoffs.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check</span>
                      <span><strong>Clear &amp; Readable Text:</strong> No blur, glare, or heavy reflections covering text or photo.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check</span>
                      <span><strong>Valid &amp; Unexpired:</strong> Expired or damaged cards will be automatically rejected.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">close</span>
                      <span><strong>No Screenshots:</strong> Upload direct camera photos or original document scans.</span>
                    </li>
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSampleModalOpen(false)}
                className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer transition-all active:scale-95"
              >
                I Understand, Continue
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4-Digit Transaction PIN Verification Bottom Drawer Model */}
      <AnimatePresence>
        {isPinModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPinModalOpen(false)}
              className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] p-6 pb-8 z-[100001] flex flex-col items-center text-center text-black font-hanken select-none shadow-2xl border-t border-gray-100"
            >
              {/* Drawer Grab Bar Handle */}
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-4 shrink-0" />

              {is2faStage ? (
                <TwoFactorOtpVerificationView
                  user={user}
                  title="Tier Upgrade Verification"
                  description="PIN/Biometrics verified! Select delivery channel and verify 2FA OTP to submit tier limit upgrade request."
                  onVerifiedSuccess={() => {
                    setIsPinModalOpen(false);
                    executeVerifiedSubmit(verifiedPin);
                  }}
                  onCancel={() => {
                    setIs2faStage(false);
                    setPinDigits(["", "", "", ""]);
                  }}
                />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-orange-50 border border-orange-100 text-[#FC7A00] flex items-center justify-center shrink-0 mb-1">
                    <span className="material-symbols-outlined text-[24px]">lock</span>
                  </div>

                  <div>
                    <h4 className="font-extrabold text-base uppercase text-gray-900">Enter Access PIN</h4>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold">
                      Enter your 4-digit transaction PIN to confirm tier limit upgrade application.
                    </p>
                  </div>

                  {/* 4 Pin Boxes */}
                  <div className="flex justify-center gap-3 py-2">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all shadow-xs",
                          pinDigits[idx] ? "border-[#FC7A00] bg-orange-50/20 text-[#FC7A00]" : "border-gray-200 text-gray-400 bg-gray-50"
                        )}
                      >
                        {pinDigits[idx] ? "•" : ""}
                      </div>
                    ))}
                  </div>

                  {/* Numeric Keypad Grid */}
                  <div className="grid grid-cols-3 gap-2.5 pt-2 w-full max-w-xs">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={isVerifyingPin}
                        onClick={() => handlePinDigitPress(num)}
                        className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl font-black text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={isVerifyingPin}
                      onClick={handlePinClear}
                      className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-2xl font-bold text-xs uppercase text-gray-600 active:scale-95 transition-all cursor-pointer"
                    >
                      CLEAR
                    </button>
                    <button
                      type="button"
                      disabled={isVerifyingPin}
                      onClick={() => handlePinDigitPress("0")}
                      className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl font-black text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      disabled={isVerifyingPin}
                      onClick={handlePinBackspace}
                      className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-2xl font-bold text-lg text-black active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[20px]">backspace</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase rounded-2xl cursor-pointer active:scale-95 transition-all mt-2"
                  >
                    Cancel
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>,
    document.body
  );
}
