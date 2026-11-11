"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { RouteGuard } from "@/components/RouteGuard";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import BannerSlideshow from "@/components/BannerSlideshow";

interface ReferralRecord {
  id: string;
  referrerUid: string;
  referredUid: string;
  referrerAccountId: string;
  referredAccountId: string;
  referredName: string;
  referredEmail: string;
  status: "pending" | "active";
  amountPaid: number;
  minFundingRequired: number;
  createdAt: string;
  updatedAt: string;
}

export default function ReferralsPage() {
  const { userData, user, loading } = useAuth();
  const router = useRouter();

  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "pending">("all");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    // Session Playtest check bypass
    const isMockMode = typeof window !== "undefined" && window.sessionStorage?.getItem("mock") === "true";
    if (isMockMode) {
      // populate high-fidelity mock data for playtesting
      setReferrals([
        {
          id: "mock1",
          referrerUid: "mock-uid",
          referredUid: "ref1",
          referrerAccountId: "ET-DEMO12",
          referredAccountId: "ET-SUCC01",
          referredName: "Emeka Obi",
          referredEmail: "emeka.obi@example.com",
          status: "active",
          amountPaid: 1000,
          minFundingRequired: 2000,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "mock2",
          referrerUid: "mock-uid",
          referredUid: "ref2",
          referrerAccountId: "ET-DEMO12",
          referredAccountId: "",
          referredName: "Aisha Yusuf",
          referredEmail: "aisha.y@example.com",
          status: "pending",
          amountPaid: 0,
          minFundingRequired: 2000,
          createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        }
      ]);
      setIsPageLoading(false);
      return;
    }

    if (loading) return;

    const fetchReferrals = async () => {
      try {
        const idToken = await user?.getIdToken();
        if (!idToken) return;

        const res = await fetch("/api/referrals", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const data = await res.json();

        if (data.success) {
          setReferrals(data.referrals || []);
        } else {
          toast.error(data.error || "Failed to load referrals.");
        }
      } catch (err: any) {
        console.error("Error loading referrals:", err);
        toast.error("An error occurred while fetching your referrals.");
      } finally {
        setIsPageLoading(false);
      }
    };

    fetchReferrals();
  }, [user, loading]);

  const accountId = String(userData?.accountId || "ET-XXXXXX");

  const handleCopyAccountId = async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(String(accountId));
      toast.success("Account ID copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please manually select and copy.");
    } finally {
      setTimeout(() => setCopying(false), 1000);
    }
  };

  // Filtered lists
  const activeReferrals = referrals.filter((r) => r.status === "active");
  const pendingReferrals = referrals.filter((r) => r.status === "pending");

  const displayedReferrals = referrals.filter((r) => {
    if (activeTab === "active") return r.status === "active";
    if (activeTab === "pending") return r.status === "pending";
    return true;
  });

  const totalEarnings = activeReferrals.reduce((sum, r) => sum + r.amountPaid, 0);

  return (
    <RouteGuard>
      <div className="min-h-screen bg-gray-50 flex flex-col pb-32">
        {/* Navigation Header */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
          <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={() => { triggerHaptic(); router.push("/"); }}
              className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] font-bold">arrow_back</span>
            </button>
            <h1 className="font-hanken font-bold text-base text-black">My Referrals</h1>
            <div className="w-8" />
          </div>
        </div>

        <main className="flex-1 max-w-md w-full mx-auto px-4 pt-5 space-y-6 !mt-0" style={{ marginTop: 0 }}>
          {/* Marketing Slide Banners */}
          <BannerSlideshow page="referral" />

          {/* Header Description banner */}
          <div className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/5 rounded-3xl p-5 text-white relative overflow-hidden select-none shadow-sm">
            <div className="absolute right-0 bottom-0 opacity-10 text-[100px] select-none pointer-events-none translate-x-1/6 translate-y-1/6">
              <span className="material-symbols-outlined font-black text-white">group_add</span>
            </div>

            <p className="font-hanken text-[10px] text-[#FC7A00] font-black uppercase tracking-widest">E-Tech Reward Hub</p>
            <h2 className="font-hanken font-bold text-xl text-white mt-1 leading-tight">Invite & Earn ₦1,000</h2>
            <p className="font-hanken text-[11px] text-gray-400 mt-2 leading-relaxed">
              Share your Account ID with your friends. When they register and fund their wallets with a minimum of <strong className="text-white">₦2,000 NGN</strong>, you instantly get credited <strong className="text-[#FC7A00]">₦1,000 NGN</strong> in your main wallet balance.
            </p>

            {/* Account ID Display Box */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-3.5 mt-4 flex items-center justify-between">
              <div>
                <span className="font-hanken text-[9px] text-gray-300 uppercase tracking-widest font-bold">Your Account ID</span>
                <p className="font-mono text-base font-black text-white tracking-widest select-all mt-0.5">{accountId}</p>
              </div>
              <button
                onClick={handleCopyAccountId}
                className="bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white font-hanken text-[11px] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copying ? "done" : "content_copy"}
                </span>
                {copying ? "Copied" : "Copy ID"}
              </button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                <span className="material-symbols-outlined text-[16px]">diversity_3</span>
                <span className="font-hanken text-[9px] uppercase tracking-wider font-bold">Total Invites</span>
              </div>
              <div>
                <p className="font-mono text-xl font-black text-black leading-none">{referrals.length}</p>
                <div className="flex gap-2 items-center mt-1.5">
                  <span className="font-hanken text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1 py-0.5 rounded">
                    {activeReferrals.length} Active
                  </span>
                  <span className="font-hanken text-[9px] text-amber-500 font-bold bg-amber-50 px-1 py-0.5 rounded">
                    {pendingReferrals.length} Pending
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">payments</span>
                <span className="font-hanken text-[9px] uppercase tracking-wider font-bold">Total Earnings</span>
              </div>
              <div>
                <p className="font-mono text-xl font-black text-[#FC7A00] leading-none">₦{totalEarnings.toLocaleString()}</p>
                <p className="font-hanken text-[9px] text-gray-400 mt-2 font-bold uppercase tracking-wider">Withdrawable Balance</p>
              </div>
            </div>
          </div>

          {/* Filters/Tabs */}
          <div className="flex p-1 bg-gray-200/80 rounded-xl">
            {(["all", "active", "pending"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-hanken font-bold uppercase tracking-wide transition-all cursor-pointer text-center",
                  activeTab === tab
                    ? "bg-white text-black shadow-xs"
                    : "text-gray-500 hover:text-black"
                )}
              >
                {tab}
                {tab === "all" && ` (${referrals.length})`}
                {tab === "active" && ` (${activeReferrals.length})`}
                {tab === "pending" && ` (${pendingReferrals.length})`}
              </button>
            ))}
          </div>

          {/* Referrals List Container */}
          <div className="space-y-3">
            <h3 className="font-hanken font-bold text-xs text-gray-400 uppercase tracking-widest">Referral List</h3>

            <AnimatePresence mode="wait">
              {isPageLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between skeleton-shimmer h-16" />
                  ))}
                </div>
              ) : displayedReferrals.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white border border-dashed border-gray-200 rounded-3xl p-8 text-center"
                >
                  <span className="material-symbols-outlined text-[36px] text-gray-300">group</span>
                  <p className="font-hanken text-xs font-bold text-gray-500 mt-2">No {activeTab !== "all" ? activeTab : ""} referrals found</p>
                  <p className="font-hanken text-[10.5px] text-gray-400 mt-1">Referred users will appear here once registered.</p>
                </motion.div>
              ) : (
                <div className="space-y-2.5">
                  {displayedReferrals.map((ref) => {
                    const isCompleted = ref.status === "active";
                    return (
                      <motion.div
                        key={ref.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between shadow-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white",
                            isCompleted ? "bg-emerald-500" : "bg-amber-500"
                          )}>
                            {ref.referredName ? ref.referredName.charAt(0).toUpperCase() : "?"}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-hanken font-bold text-xs text-black truncate">{ref.referredName}</h4>
                            <p className="font-mono text-[9px] text-gray-400 truncate mt-0.5">{ref.referredEmail}</p>
                            <p className="font-hanken text-[8px] text-gray-400 uppercase mt-0.5 font-bold tracking-wider">
                              Joined: {new Date(ref.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={cn(
                            "font-mono text-[11px] font-black",
                            isCompleted ? "text-emerald-500" : "text-amber-500"
                          )}>
                            {isCompleted ? "+₦1,000" : "Pending"}
                          </span>
                          <span className={cn(
                            "font-hanken text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded",
                            isCompleted ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {isCompleted ? "Active" : "Not Funded"}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
