"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

import React, { useState, useEffect } from "react";
import { CpanelActionDropdown } from "@/components/cpanel/CpanelActionDropdown";
import { KycImageViewerModal, KycDocumentImage } from "@/components/cpanel/KycImageViewerModal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

interface PendingKycUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  kycType: "bvn" | "nin";
  kycNumber: string;
  kycStatus: "PENDING" | "PENDING_REVIEW" | "VERIFYING" | "IDENTITY_VERIFIED" | "VERIFICATION_FAILED" | "PROCESSING" | "PROVISIONING" | "VERIFIED" | "REJECTED" | "PROVISIONING_FAILED" | "UNVERIFIED";
  submittedAt: string;
  capturedSelfie?: string;
  livenessChallenge?: string;
  photoURL?: string;
  idCardUrl?: string;
  utilityBillUrl?: string;
  proofOfAddressUrl?: string;
  virtualAccountNumber?: string;
  virtualAccountBankName?: string;
  balance?: number;
}

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function CpanelKycPageContent() {
  const { user } = useAuth();
  const router = useRouter();

  const { isDark, toggleTheme } = useCpanelTheme();
  const [pendingKycList, setPendingKycUser] = useState<PendingKycUser[]>([]);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState<Record<string, "flutterwave" | "squad">>({});

  const [isLoadingKyc, setIsLoadingKyc] = useState(false);
  const [isProcessingKyc, setIsProcessingKyc] = useState<string | null>(null);

  const [kycTab, setKycTab] = useState<"pending" | "verified_today" | "unverified">("pending");
  const [kycLastDocId, setKycLastDocId] = useState("");
  const [kycHasMore, setKycHasMore] = useState(false);
  const [kycTotalCount, setKycTotalCount] = useState(0);

  // Dynamic Tier Levels state
  const [tierOptions, setTierOptions] = useState<{ id: string; name: string; dailyLimit: number; singleLimit: number; maxBalance: number }[]>([
    { id: "tier_1", name: "Tier 1", dailyLimit: 500000, singleLimit: 200000, maxBalance: 300000 },
    { id: "tier_2", name: "Tier 2", dailyLimit: 5000000, singleLimit: 2000000, maxBalance: 5000000 },
    { id: "tier_3", name: "Tier 3", dailyLimit: 50000000, singleLimit: 10000000, maxBalance: 50000000 },
  ]);

  // Inspector, Editor & Approval Drawer States
  const [inspectingUser, setInspectingUser] = useState<PendingKycUser | null>(null);
  const [editingUser, setEditingUser] = useState<PendingKycUser | null>(null);
  const [approvingKycUser, setApprovingKycUser] = useState<PendingKycUser | null>(null);
  const [approveTier, setApproveTier] = useState<string>("Tier 2");
  const [approveProvider, setApproveProvider] = useState<"flutterwave" | "squad">("flutterwave");
  const [approveDailyLimit, setApproveDailyLimit] = useState<number>(5000000);
  const [approveSingleLimit, setApproveSingleLimit] = useState<number>(2000000);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editKycType, setEditKycType] = useState<"bvn" | "nin">("bvn");
  const [editKycNumber, setEditKycNumber] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Document Lightbox/Modal Viewer State
  const [viewerModalState, setViewerModalState] = useState<{
    isOpen: boolean;
    images: KycDocumentImage[];
    initialIndex: number;
    userName: string;
    userEmail: string;
  }>({
    isOpen: false,
    images: [],
    initialIndex: 0,
    userName: "",
    userEmail: "",
  });

  const [adminActionModal, setAdminActionModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    actionStyle: "danger" | "warning" | "success" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionLabel: "",
    actionStyle: "danger",
    onConfirm: () => {},
  });

  const openDocumentViewer = (u: PendingKycUser, startIndex = 0) => {
    const imagesList: KycDocumentImage[] = [];

    if (u.idCardUrl) {
      imagesList.push({
        title: `${(u.kycType || "bvn").toUpperCase()} / Govt ID Document`,
        url: u.idCardUrl,
        type: u.kycType,
      });
    }

    if (u.capturedSelfie) {
      imagesList.push({
        title: "Biometric Verification Selfie",
        url: u.capturedSelfie,
        description: u.livenessChallenge ? `Liveness Challenge: ${u.livenessChallenge}` : undefined,
      });
    }

    if (u.utilityBillUrl || u.proofOfAddressUrl) {
      imagesList.push({
        title: "Proof of Address / Utility Bill",
        url: u.utilityBillUrl || u.proofOfAddressUrl!,
      });
    }

    if (u.photoURL && !imagesList.some((img) => img.url === u.photoURL)) {
      imagesList.push({
        title: "Profile Avatar Photo",
        url: u.photoURL,
      });
    }

    if (imagesList.length === 0) {
      toast.info("No high-resolution KYC images available for this customer.");
      return;
    }

    setViewerModalState({
      isOpen: true,
      images: imagesList,
      initialIndex: Math.min(startIndex, imagesList.length - 1),
      userName: u.name,
      userEmail: u.email,
    });
  };

  const triggerAdminConfirm = (
    title: string,
    message: string,
    actionLabel: string,
    actionStyle: "danger" | "warning" | "success" | "info",
    onConfirm: () => void
  ) => {
    setAdminActionModal({ isOpen: true, title, message, actionLabel, actionStyle, onConfirm });
  };

  const openEditingModal = (u: PendingKycUser) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phoneNumber || "");
    setEditKycType(u.kycType || "bvn");
    setEditKycNumber(u.kycNumber || "");
  };

  const handleSaveUserKycInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSavingEdit(true);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "update_user_kyc_info",
          targetUid: editingUser.uid,
          name: editName,
          email: editEmail,
          phoneNumber: editPhone,
          kycType: editKycType,
          kycNumber: editKycNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Customer KYC information saved!");
        setPendingKycUser((prev) =>
          prev.map((item) =>
            item.uid === editingUser.uid
              ? {
                  ...item,
                  name: editName,
                  email: editEmail,
                  phoneNumber: editPhone,
                  kycType: editKycType,
                  kycNumber: editKycNumber,
                }
              : item
          )
        );
        if (inspectingUser && inspectingUser.uid === editingUser.uid) {
          setInspectingUser({
            ...inspectingUser,
            name: editName,
            email: editEmail,
            phoneNumber: editPhone,
            kycType: editKycType,
            kycNumber: editKycNumber,
          });
        }
        setEditingUser(null);
      } else {
        toast.error(data.error || "Failed to update customer KYC info.");
      }
    } catch {
      toast.error("Network communication error saving user details.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const fetchPendingKyc = async (isLoadMore: boolean = false, customTab?: "pending" | "verified_today" | "unverified") => {
    setIsLoadingKyc(true);
    const activeTabToFetch = customTab || kycTab;
    const lastDocIdToFetch = isLoadMore ? kycLastDocId : "";

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/admin/kyc?tab=${activeTabToFetch}&limit=10&lastDocId=${lastDocIdToFetch}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (isLoadMore) {
          setPendingKycUser((prev) => [...prev, ...(data.pendingUsers || [])]);
        } else {
          setPendingKycUser(data.pendingUsers || []);
        }
        setKycLastDocId(data.lastDocId || "");
        setKycHasMore(!!data.hasMore);
        setKycTotalCount(data.totalCount || 0);
      } else {
        toast.error(data.error || "Failed to load waiting KYC approvals.");
      }
    } catch {
      toast.error("Network communication failure loading waiting KYC approvals.");
    } finally {
      setIsLoadingKyc(false);
    }
  };

  useEffect(() => {
    fetchPendingKyc(false, kycTab);
    fetchTierLevels();
  }, [kycTab]);

  const fetchTierLevels = async () => {
    try {
      const res = await fetch("/api/admin/tier-levels");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.tierLevels) && data.tierLevels.length > 0) {
        setTierOptions(data.tierLevels);
      }
    } catch {
      // Ignore background tier level fetch errors
    }
  };

  const handleKycApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingKycUser) return;

    setIsProcessingKyc(approvingKycUser.uid);
    toast.loading("Approving KYC, setting transaction limits & provisioning account...");

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "approve",
          targetUid: approvingKycUser.uid,
          provider: approveProvider,
          tier: approveTier,
          dailyLimit: approveDailyLimit,
          singleLimit: approveSingleLimit,
        }),
      });

      toast.dismiss();
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "KYC Approved and virtual account provisioned!");
        setPendingKycUser((prev) => prev.filter((u) => u.uid !== approvingKycUser.uid));
        setApprovingKycUser(null);
      } else {
        toast.error(data.error || "Failed to approve KYC.");
      }
    } catch {
      toast.dismiss();
      toast.error("API connection error during KYC approval.");
    } finally {
      setIsProcessingKyc(null);
    }
  };

  const handleProcessKyc = async (targetUid: string, action: "verify" | "approve" | "reject" | "retry" | "move_to_pending") => {
    setIsProcessingKyc(targetUid);
    const reason = rejectionReason[targetUid] || "";
    const provider = selectedProvider[targetUid];

    if ((action === "approve" || action === "retry") && !provider) {
      toast.error("Please explicitly select a virtual-account provider (Flutterwave or Squadco) before proceeding.");
      setIsProcessingKyc(null);
      return;
    }

    if (action === "reject" && !reason.trim()) {
      toast.error("Please enter a rejection reason before rejecting identity verification.");
      setIsProcessingKyc(null);
      return;
    }

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action, targetUid, reason, provider, tier: "Tier 2" }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `KYC successfully processed!`);
        if (action === "approve" || action === "retry") {
          setPendingKycUser((prev) => prev.filter((u) => u.uid !== targetUid));
        } else if (action === "verify") {
          setPendingKycUser((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, kycStatus: "IDENTITY_VERIFIED" as any } : u)));
        } else if (action === "move_to_pending") {
          setPendingKycUser((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, kycStatus: "PENDING" as any } : u)));
        } else if (action === "reject") {
          setPendingKycUser((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, kycStatus: "REJECTED" as any } : u)));
        }
      } else {
        toast.error(data.error || "Failed to process KYC verification.");
      }
    } catch {
      toast.error("API connection error during verification processing.");
    } finally {
      setIsProcessingKyc(null);
    }
  };

  const handleDeleteUnverifiedUser = async (targetUid: string, name: string) => {
    triggerAdminConfirm(
      "Purge User Profile?",
      `Are you absolutely sure you want to permanently delete unverified user "${name.toUpperCase()}"? This action is IRREVERSIBLE.`,
      "Delete Permanently",
      "danger",
      async () => {
        toast.loading("Purging unverified user from server databases...");
        try {
          let idToken = "mock-admin-token";
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          if (!isMock && user) {
            idToken = await user.getIdToken();
          }

          const res = await fetch("/api/admin/kyc", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ action: "delete_unverified", targetUid }),
          });

          const data = await res.json();
          toast.dismiss();
          if (res.ok && data.success) {
            toast.success(data.message || "User profile permanently deleted.");
            setPendingKycUser((prev) => prev.filter((u) => u.uid !== targetUid));
            if (inspectingUser && inspectingUser.uid === targetUid) {
              setInspectingUser(null);
            }
          } else {
            toast.error(data.error || "Failed to delete user profile.");
          }
        } catch {
          toast.dismiss();
          toast.error("Network communication failure deleting user.");
        }
      }
    );
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";
  const labelClass = isDark ? "text-gray-300" : "text-gray-900";

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">verified_user</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">KYC Document Verification Queue</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Review customer BVN/NIN identity verification documents and provision virtual banking accounts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/cpanel/limits"
              className="px-3.5 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Account Limits Manager</span>
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>

            <Link
              href="/cpanel"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Control Panel</span>
            </Link>
          </div>
        </div>

        {/* Tab Controls */}
        <div className={cn("rounded-2xl p-6 border space-y-4", panelClass)}>
          <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
            <div>
              <h3 className={cn("font-hanken font-extrabold text-sm uppercase", labelClass)}>
                KYC Approvals Queue ({kycTotalCount})
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Paginated low-cost Firestore query system</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKycTab("pending")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                  kycTab === "pending"
                    ? "bg-[#FC7A00] text-white shadow-xs"
                    : isDark ? "bg-gray-800 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Pending Approvals
              </button>
              <button
                type="button"
                onClick={() => setKycTab("verified_today")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                  kycTab === "verified_today"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : isDark ? "bg-gray-800 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Verified Today
              </button>
              <button
                type="button"
                onClick={() => setKycTab("unverified")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                  kycTab === "unverified"
                    ? "bg-rose-600 text-white shadow-xs"
                    : isDark ? "bg-gray-800 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Unverified
              </button>
            </div>
          </div>

          {isLoadingKyc && pendingKycList.length === 0 ? (
            <div className="text-center py-12 text-gray-400 uppercase tracking-widest font-bold text-xs">
              <ButtonSpinner /> Loading KYC Submissions...
            </div>
          ) : pendingKycList.length === 0 ? (
            <div className={cn("border rounded-xl p-6 text-center space-y-1.5", isDark ? "border-gray-800 bg-gray-900/50" : "border-gray-150 bg-gray-50/50")}>
              <span className="material-symbols-outlined text-[32px] text-emerald-500" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
              <p className={cn("font-black text-xs uppercase", isDark ? "text-white" : "text-gray-800")}>Queue Clean</p>
              <p className="text-[11px] text-gray-400 font-medium">No pending user documents found in this tab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingKycList.map((u) => {
                const processing = isProcessingKyc === u.uid;
                const reasonText = rejectionReason[u.uid] || "";
                const currentProvider = selectedProvider[u.uid] || "";

                return (
                  <div key={u.uid} className={cn("p-4 border rounded-2xl transition-all space-y-3", isDark ? "border-gray-800 bg-gray-900/40 hover:bg-gray-850/30" : "border-gray-150 bg-gray-50/50 hover:bg-gray-100/30")}>
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border border-[#FC7A00]/30 bg-orange-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-extrabold text-[#FC7A00] text-sm font-hanken">
                              {u.name ? u.name.slice(0, 2).toUpperCase() : "US"}
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className={cn("font-extrabold text-sm leading-none", isDark ? "text-white" : "text-gray-900")}>{u.name}</h4>
                          <p className="text-xs font-semibold mt-1 select-all text-gray-400">{u.email}</p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{u.phoneNumber}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                          u.kycStatus === "VERIFIED" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          u.kycStatus === "IDENTITY_VERIFIED" && "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                          u.kycStatus === "PENDING" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          u.kycStatus === "REJECTED" && "bg-rose-500/10 text-rose-400 border-rose-500/20",
                          u.kycStatus === "PROVISIONING_FAILED" && "bg-rose-500/10 text-rose-400 border-rose-500/20",
                          u.kycStatus === "UNVERIFIED" && "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        )}>
                          {u.kycStatus}
                        </span>
                        <p className="text-[9px] font-mono text-gray-400 mt-1">{new Date(u.submittedAt).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* KYC Document Thumbnails & Inspection Bar */}
                    {(u.capturedSelfie || u.idCardUrl || u.utilityBillUrl || u.proofOfAddressUrl || u.photoURL) && (
                      <div className={cn("p-3 rounded-xl border space-y-2", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
                        <div className="flex items-center justify-between">
                          <p className="font-extrabold text-[10px] uppercase tracking-wider text-[#FC7A00] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">photo_library</span>
                            <span>KYC Document Files</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => openDocumentViewer(u, 0)}
                            className="text-[10px] font-black uppercase text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">zoom_in</span>
                            <span>Inspect High-Res</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                          {u.idCardUrl && (
                            <button
                              type="button"
                              onClick={() => openDocumentViewer(u, 0)}
                              className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 shrink-0 group cursor-pointer"
                              title="Govt ID Card"
                            >
                              <img src={u.idCardUrl} alt="ID Card" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-black uppercase text-white text-center py-0.5">
                                ID Card
                              </span>
                            </button>
                          )}

                          {u.capturedSelfie && (
                            <button
                              type="button"
                              onClick={() => openDocumentViewer(u, u.idCardUrl ? 1 : 0)}
                              className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 shrink-0 group cursor-pointer"
                              title="Biometric Selfie"
                            >
                              <img src={u.capturedSelfie} alt="Selfie" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-black uppercase text-white text-center py-0.5">
                                Selfie
                              </span>
                            </button>
                          )}

                          {(u.utilityBillUrl || u.proofOfAddressUrl) && (
                            <button
                              type="button"
                              onClick={() => openDocumentViewer(u, (u.idCardUrl ? 1 : 0) + (u.capturedSelfie ? 1 : 0))}
                              className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 shrink-0 group cursor-pointer"
                              title="Utility Bill / Address Proof"
                            >
                              <img src={u.utilityBillUrl || u.proofOfAddressUrl} alt="Utility Bill" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] font-black uppercase text-white text-center py-0.5">
                                Address
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* KYC Type & Number */}
                    <div className={cn("p-3 rounded-xl border space-y-1.5", isDark ? "bg-gray-800/60 border-gray-700" : "bg-white border-gray-200")}>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black uppercase text-gray-400">{u.kycType ? u.kycType.toUpperCase() : "BVN"} Number:</span>
                        <span className="font-mono font-bold select-all text-emerald-500">{u.kycNumber || "NOT PROVIDED"}</span>
                      </div>
                    </div>

                    {/* Provider Selector for Approval */}
                    {(u.kycStatus === "IDENTITY_VERIFIED" || u.kycStatus === "PROVISIONING_FAILED" || u.kycStatus === "PENDING" || u.kycStatus === "UNVERIFIED") && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-gray-400">Select Virtual Account Gateway Provider *</label>
                        <select
                          value={currentProvider}
                          onChange={(e) => setSelectedProvider({ ...selectedProvider, [u.uid]: e.target.value as any })}
                          className={cn(inputClass, "cursor-pointer font-bold")}
                        >
                          <option value="">-- Choose Virtual Bank Gateway --</option>
                          <option value="flutterwave">Flutterwave Gateway Rail</option>
                          <option value="squad">Squadco (GTBank) Virtual Account Rail</option>
                        </select>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/30">
                      <CpanelActionDropdown
                        isDark={isDark}
                        actions={[
                          {
                            label: "Inspect High-Res Images",
                            icon: "preview",
                            variant: "emerald",
                            onClick: () => openDocumentViewer(u, 0),
                          },
                          {
                            label: "View Account Info",
                            icon: "info",
                            onClick: () => setInspectingUser(u),
                          },
                          {
                            label: "Edit KYC Details",
                            icon: "edit_note",
                            variant: "emerald",
                            onClick: () => openEditingModal(u),
                          },
                          {
                            label: "Move to Pending Queue",
                            icon: "pending_actions",
                            variant: "warning",
                            disabled: u.kycStatus !== "UNVERIFIED" && u.kycStatus !== "REJECTED",
                            onClick: () => handleProcessKyc(u.uid, "move_to_pending"),
                          },
                          {
                            label: "Check Identity",
                            icon: "badge",
                            disabled: !(u.kycStatus === "PENDING" || u.kycStatus === "PENDING_REVIEW" || u.kycStatus === "VERIFICATION_FAILED" || u.kycStatus === "UNVERIFIED"),
                            onClick: () => handleProcessKyc(u.uid, "verify"),
                          },
                          {
                            label: "Approve & Provision",
                            icon: "verified",
                            variant: "emerald",
                            disabled: !(u.kycStatus === "IDENTITY_VERIFIED" || u.kycStatus === "PENDING" || u.kycStatus === "UNVERIFIED"),
                            onClick: () => {
                              setApprovingKycUser(u);
                              setApproveProvider(selectedProvider[u.uid] || "flutterwave");
                              setApproveTier("Tier 2");
                              setApproveDailyLimit(5000000);
                              setApproveSingleLimit(2000000);
                            },
                          },
                          {
                            label: "Retry Provisioning",
                            icon: "refresh",
                            variant: "warning",
                            disabled: u.kycStatus !== "PROVISIONING_FAILED",
                            onClick: () => handleProcessKyc(u.uid, "retry"),
                          },
                          {
                            label: "Reject KYC",
                            icon: "cancel",
                            variant: "danger",
                            disabled: u.kycStatus === "REJECTED" || u.kycStatus === "VERIFIED",
                            onClick: () => handleProcessKyc(u.uid, "reject"),
                          },
                          {
                            label: "Delete User",
                            icon: "delete_forever",
                            variant: "danger",
                            disabled: u.kycStatus !== "UNVERIFIED" && u.kycStatus !== "REJECTED",
                            onClick: () => handleDeleteUnverifiedUser(u.uid, u.name),
                          },
                        ]}
                      />

                      {(u.kycStatus === "UNVERIFIED" || u.kycStatus === "REJECTED") && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUnverifiedUser(u.uid, u.name)}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                          <span>Delete {u.kycStatus === "REJECTED" ? "Rejected" : "Unverified"} User</span>
                        </button>
                      )}
                    </div>

                    {u.kycStatus !== "REJECTED" && u.kycStatus !== "VERIFIED" && u.kycStatus !== "UNVERIFIED" && (
                      <div className="space-y-2 text-right">
                        <input
                          type="text"
                          value={reasonText}
                          onChange={(e) => setRejectionReason({ ...rejectionReason, [u.uid]: e.target.value })}
                          placeholder="Reason if rejecting..."
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={!!isProcessingKyc}
                          onClick={() => handleProcessKyc(u.uid, "reject")}
                          className="px-4 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[9px] font-black uppercase rounded-xl border border-rose-500/20 transition-all disabled:opacity-50 cursor-pointer inline-block"
                        >
                          Decline and Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {kycHasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                disabled={isLoadingKyc}
                onClick={() => fetchPendingKyc(true, kycTab)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto",
                  isDark ? "bg-gray-800 text-[#FC7A00] border border-gray-700 hover:bg-gray-750" : "bg-orange-50 text-[#FC7A00] border border-orange-100 hover:bg-orange-100/50"
                )}
              >
                {isLoadingKyc ? <ButtonSpinner /> : "Load More Users"}
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Account Details Inspector Modal Drawer */}
      {inspectingUser && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className={cn("w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-12 h-12 rounded-full border border-[#FC7A00]/30 bg-orange-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {inspectingUser.photoURL ? (
                    <img src={inspectingUser.photoURL} alt={inspectingUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-extrabold text-[#FC7A00] text-sm font-hanken">
                      {inspectingUser.name ? inspectingUser.name.slice(0, 2).toUpperCase() : "US"}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold uppercase">{inspectingUser.name}</h3>
                  <p className="text-[10px] text-gray-400 font-mono">UID: {inspectingUser.uid}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingUser(null)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Selfie preview if available */}
              {inspectingUser.capturedSelfie && (
                <div className="flex items-center gap-4 p-3 rounded-2xl border bg-orange-500/5 border-orange-500/20">
                  <img src={inspectingUser.capturedSelfie} alt="Biometric Selfie" className="w-20 h-20 rounded-xl object-cover border border-orange-500/30" />
                  <div>
                    <span className="font-extrabold text-[#FC7A00] uppercase text-[10px]">Captured Biometric Selfie</span>
                    <p className="text-gray-400 text-[11px] mt-1 font-semibold">Liveness Verification Code: <span className="font-mono text-white">{inspectingUser.livenessChallenge || "Passed"}</span></p>
                  </div>
                </div>
              )}

              {/* Profile Details Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl border border-gray-200/50 dark:border-gray-800">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">Full Name</span>
                  <p className="font-bold text-sm mt-0.5">{inspectingUser.name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">KYC Status</span>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {inspectingUser.kycStatus}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">Email Address</span>
                  <p className="font-semibold text-xs mt-0.5 select-all truncate">{inspectingUser.email || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">Phone Number</span>
                  <p className="font-semibold text-xs mt-0.5 select-all font-mono">{inspectingUser.phoneNumber || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">KYC Document Type</span>
                  <p className="font-bold uppercase text-xs mt-0.5 text-[#FC7A00]">{inspectingUser.kycType || "BVN"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-gray-400 block">Document Number</span>
                  <p className="font-mono font-bold text-xs mt-0.5 text-emerald-500 select-all">{inspectingUser.kycNumber || "NOT PROVIDED"}</p>
                </div>
              </div>

              {/* Virtual Account & Wallet Info */}
              <div className="p-4 rounded-2xl border border-gray-200/50 dark:border-gray-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold uppercase text-gray-400">Virtual Account Number</span>
                  <span className="font-mono font-black text-sm text-[#FC7A00] select-all">{inspectingUser.virtualAccountNumber || "Not Assigned Yet"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold uppercase text-gray-400">Virtual Account Bank</span>
                  <span className="font-bold text-xs">{inspectingUser.virtualAccountBankName || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold uppercase text-gray-400">Wallet Available Balance</span>
                  <span className="font-bold text-xs text-emerald-500">₦{(inspectingUser.balance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-800 flex-wrap">
              {inspectingUser.kycStatus === "UNVERIFIED" || inspectingUser.kycStatus === "REJECTED" ? (
                <button
                  type="button"
                  onClick={() => {
                    const targetUid = inspectingUser.uid;
                    const name = inspectingUser.name;
                    handleDeleteUnverifiedUser(targetUid, name);
                  }}
                  className="px-4 py-2 bg-rose-600 text-white text-xs font-extrabold uppercase rounded-xl hover:bg-rose-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                  <span>Delete {inspectingUser.kycStatus === "REJECTED" ? "Rejected" : "Unverified"} User</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openEditingModal(inspectingUser);
                  }}
                  className="px-4 py-2 bg-[#FC7A00] text-white text-xs font-bold uppercase rounded-xl hover:bg-[#e06c00] transition-all cursor-pointer"
                >
                  Edit KYC Information
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingUser(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer KYC Details Drawer Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {editingUser.photoURL ? (
                    <img src={editingUser.photoURL} alt={editingUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-extrabold text-emerald-500 text-xs font-hanken">
                      {editingUser.name ? editingUser.name.slice(0, 2).toUpperCase() : "US"}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold uppercase">Edit Customer KYC Details</h3>
                  <p className="text-[10px] text-gray-400">Update missing or incorrect verification details.</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveUserKycInfo} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Customer Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Jules Verne"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Email Address</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Phone Number</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+2348012345678"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">KYC Type</label>
                  <select
                    value={editKycType}
                    onChange={(e) => setEditKycType(e.target.value as "bvn" | "nin")}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="bvn">BVN (Bank Verification Number)</option>
                    <option value="nin">NIN (National Identity Number)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">KYC Document Number</label>
                  <input
                    type="text"
                    required
                    value={editKycNumber}
                    onChange={(e) => setEditKycNumber(e.target.value)}
                    placeholder="11-digit BVN or NIN"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/50 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  {isSavingEdit && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Save KYC Details</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KYC Approval & Transaction Limits Customizer Modal */}
      {approvingKycUser && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-500 text-[24px]">verified</span>
                <div>
                  <h3 className="text-base font-extrabold uppercase">Approve KYC & Set Limits</h3>
                  <p className="text-[10px] text-gray-400">Set customer Tier level and transaction limits.</p>
                </div>
              </div>
              <button
                onClick={() => setApprovingKycUser(null)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <form onSubmit={handleKycApproveSubmit} className="space-y-4 text-xs">
              <div className="p-3.5 bg-gray-50 dark:bg-gray-800 rounded-2xl border space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400">Customer</span>
                <p className="font-extrabold text-sm text-gray-900 dark:text-white">{approvingKycUser.name}</p>
                <p className="font-mono text-[11px] text-gray-400">{approvingKycUser.email}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Virtual Account Gateway Provider *</label>
                <select
                  value={approveProvider}
                  onChange={(e) => setApproveProvider(e.target.value as any)}
                  className={cn(inputClass, "cursor-pointer font-bold")}
                >
                  <option value="flutterwave">Flutterwave Gateway Rail</option>
                  <option value="squad">Squadco (GTBank) Virtual Account Rail</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Assign Tier Level *</label>
                <select
                  value={approveTier}
                  onChange={(e) => {
                    const val = e.target.value;
                    setApproveTier(val);
                    const matched = tierOptions.find((t) => t.name === val || t.id === val);
                    if (matched) {
                      setApproveDailyLimit(matched.dailyLimit);
                      setApproveSingleLimit(matched.singleLimit);
                    }
                  }}
                  className={cn(inputClass, "cursor-pointer font-bold")}
                >
                  {tierOptions.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} (₦{t.dailyLimit.toLocaleString("en-NG")} / Day)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Daily Transfer Limit (₦)</label>
                <input
                  type="number"
                  required
                  min={100000}
                  value={approveDailyLimit}
                  onChange={(e) => setApproveDailyLimit(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Single Transfer Limit (₦)</label>
                <input
                  type="number"
                  required
                  min={50000}
                  value={approveSingleLimit}
                  onChange={(e) => setApproveSingleLimit(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/50 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setApprovingKycUser(null)}
                  disabled={!!isProcessingKyc}
                  className="px-4 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!isProcessingKyc}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isProcessingKyc && <ButtonSpinner />}
                  <span>Approve & Set Limits</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Resolution KYC Image Inspection Lightbox Modal */}
      <KycImageViewerModal
        key={`${viewerModalState.userName}-${viewerModalState.initialIndex}`}
        isOpen={viewerModalState.isOpen}
        images={viewerModalState.images}
        initialIndex={viewerModalState.initialIndex}
        userName={viewerModalState.userName}
        userEmail={viewerModalState.userEmail}
        isDark={isDark}
        onClose={() => setViewerModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Confirmation Modal */}
      {adminActionModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto border",
              adminActionModal.actionStyle === "danger" && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:border-red-900/50"
            )}>
              <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{adminActionModal.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">{adminActionModal.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdminActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminActionModal((prev) => ({ ...prev, isOpen: false }));
                  adminActionModal.onConfirm();
                }}
                className="py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-red-700"
              >
                {adminActionModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelKycPage() {
  return (
    <CpanelRouteGuard requiredPermission="kyc.view">
      <CpanelKycPageContent />
    </CpanelRouteGuard>
  );
}
