"use client";

import React from "react";
import { toast } from "sonner";

interface StaticAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface KycStatusSectionProps {
  kycStatus?: string;
  bvn?: string;
  nin?: string;
  kycRejectionReason?: string;
  loadingAccount: boolean;
  isProfileLoading: boolean;
  staticAccount: StaticAccount | null;
  onOpenKycDrawer: () => void;
}

export function KycStatusSection({
  kycStatus,
  bvn,
  nin,
  kycRejectionReason,
  loadingAccount,
  isProfileLoading,
  staticAccount,
  onOpenKycDrawer,
}: KycStatusSectionProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const isPendingReview = ["PENDING", "PENDING_REVIEW", "VERIFYING", "PROCESSING", "PROVISIONING", "IDENTITY_VERIFIED", "PROVISIONING_FAILED"].includes(kycStatus || "");

  return (
    <section className="premium-gradient-card premium-gradient-border p-6 space-y-4">
      <div className="border-b border-gray-100/60 pb-2.5">
        <h3 className="font-hanken font-bold text-sm tracking-wider uppercase text-gray-500">
          Identity Verification & Static Account (KYC)
        </h3>
        <p className="font-hanken text-[10px] text-gray-400 mt-0.5">Required to allocate permanent virtual bank accounts</p>
      </div>

      {kycStatus === "VERIFIED" ? (
        // VERIFIED DISPLAY Badges & Details
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800">
            <span className="material-symbols-outlined text-emerald-600 font-black text-[22px]">check_circle</span>
            <div>
              <p className="font-hanken font-extrabold text-xs">KYC Identity Verified</p>
              <p className="text-[10px] text-emerald-600 font-semibold">Your permanent static account is active and verified.</p>
            </div>
          </div>

          {/* Masked BVN or NIN */}
          {!!(bvn || nin) && (
            <div className="flex justify-between items-center p-3 bg-gray-50 border border-gray-150 rounded-2xl">
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Verified {bvn ? "BVN" : "NIN"} Document
                </p>
                <p className="font-mono text-sm font-extrabold text-gray-800 tracking-widest mt-0.5">
                  {(() => {
                    const val = (bvn || nin || "").trim();
                    if (val.length < 4) return val;
                    return val.slice(0, 2) + "*".repeat(val.length - 4) + val.slice(-2);
                  })()}
                </p>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                Verified
              </span>
            </div>
          )}

          {loadingAccount || isProfileLoading ? (
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-250 rounded-2xl p-5 space-y-4 relative overflow-hidden">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-1/3" />
                <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-1/4" />
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-1/4" />
                <div className="h-3.5 bg-gray-200 rounded skeleton-shimmer w-1/3" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="space-y-1.5 flex-1">
                  <div className="h-2.5 bg-gray-150 rounded skeleton-shimmer w-1/4" />
                  <div className="h-4.5 bg-gray-200 rounded skeleton-shimmer w-1/3" />
                </div>
                <div className="h-8 bg-gray-200 rounded-lg skeleton-shimmer w-16" />
              </div>
            </div>
          ) : staticAccount ? (
            <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] rounded-2xl p-5 text-white border-2 border-primary/20 space-y-4 relative overflow-hidden shadow-xl">
              <div className="absolute right-0 bottom-0 text-[120px] text-white/5 pointer-events-none select-none translate-x-1/6 translate-y-1/6">
                <span className="material-symbols-outlined">account_balance</span>
              </div>

              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Assigned Bank Name</p>
                  <p className="text-sm text-white font-extrabold tracking-wide mt-0.5 truncate">{staticAccount.bankName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className="w-10 h-10 rounded-xl bg-[#00d084]/10 border border-[#00d084]/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#00d084] text-[20px]">badge</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Account Holder Name</p>
                  <p className="text-sm text-white font-extrabold tracking-wide mt-0.5 truncate">{staticAccount.accountName}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Static Account Number</p>
                  <p className="font-mono text-lg min-[360px]:text-xl font-black text-primary tracking-widest mt-0.5 select-all">
                    {staticAccount.accountNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(staticAccount.accountNumber, "Static Account")}
                  className="bg-primary hover:bg-primary/90 text-surface-dim text-[11px] font-black py-2.5 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-primary/10 shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px] font-bold">content_copy</span>
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 font-bold text-center">Static account details could not be loaded. Please contact support.</p>
          )}
        </div>
      ) : isPendingReview ? (
        // PENDING REVIEW / VERIFYING / PROVISIONING STATE DISPLAY
        <div className="space-y-4 text-left animate-fadeIn">
          <div className="flex items-center gap-3 p-4 bg-amber-50/70 border border-amber-100 rounded-2xl text-amber-800">
            <span className="material-symbols-outlined text-amber-600 font-black text-[24px] animate-pulse shrink-0">pending_actions</span>
            <div>
              <p className="font-hanken font-extrabold text-xs uppercase tracking-wider text-amber-700">
                Pending In Review
              </p>
              <p className="text-[11px] text-amber-800 font-bold leading-relaxed mt-1">
                Your account will be approved or rejected in 30 minutes. Thanks for banking with us.
              </p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-semibold uppercase">Current Status</span>
              <span className="font-black text-[10px] uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 tracking-wider">
                Pending In Review
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 font-semibold uppercase">Verification Time</span>
              <span className="font-mono text-gray-800 font-bold">~ 30 Minutes</span>
            </div>
          </div>
        </div>
      ) : (
        // PENDING / FAILED INTERACTIVE FLOW CARD
        <div className="space-y-4 text-left">
          {(kycStatus === "REJECTED" || kycStatus === "VERIFICATION_FAILED" || kycStatus === "FAILED") && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-150 rounded-2xl text-red-700">
              <span className="material-symbols-outlined text-red-500 font-bold">error</span>
              <div>
                <p className="font-hanken font-bold text-xs">KYC Verification Unsuccessful</p>
                <p className="text-[10px] text-red-500 leading-tight">
                  {kycRejectionReason || "Your KYC verification was unsuccessful. Please check the information provided and try again."}
                </p>
              </div>
            </div>
          )}

          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-amber-800">
            <p className="font-hanken text-[11px] leading-relaxed font-semibold">
              Submit your valid 11-digit BVN or NIN and upload your identity document photo to instantly verify your identity and request permanent virtual bank account allocation.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenKycDrawer}
            className="w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-110 text-white py-3.5 rounded-2xl border border-white/10 text-xs font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] font-bold">verified_user</span>
            Verify Now
          </button>
        </div>
      )}
    </section>
  );
}
