"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { uploadImageSecurely } from "@/lib/image-upload";
const ButtonSpinner = () => (
  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
);

const ISSUE_CATEGORIES = [
  "This Transaction received but not credited to balance",
  "This Transaction received credited to balance and reverse",
  "Scam Transaction",
  "Fraud Transaction",
  "I don't trust this Transaction",
];

export interface ReportDataPayload {
  transactionReference: string;
  transactionId: string;
  amount: number;
  currency: string;
  transactionType: string;
  transactionDate: string;
  recipientName: string;
  issueCategory: string;
  customNote: string;
  screenshotUrl?: string;
}

interface ReportTransactionIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    reference?: string;
    id?: string;
    amount?: number;
    currency?: string;
    type?: string;
    date?: string;
    recipientName?: string;
    beneficiaryName?: string;
    senderName?: string;
    description?: string;
  };
  onAuthorizeAndSubmit: (data: ReportDataPayload) => void;
  isSubmitting?: boolean;
}

export function ReportTransactionIssueModal({
  isOpen,
  onClose,
  transaction,
  onAuthorizeAndSubmit,
  isSubmitting = false,
}: ReportTransactionIssueModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(ISSUE_CATEGORIES[0]);
  const [customNote, setCustomNote] = useState<string>("");
  const [screenshotUrl, setScreenshotUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (PNG, JPG, WEBP).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size exceeds 10MB limit.");
      return;
    }

    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      const res = await uploadImageSecurely(file, "trn_report_screenshot", (percent) => {
        setUploadProgress(percent);
      });

      if (res.success && res.url) {
        setScreenshotUrl(res.url);
        toast.success("Screenshot uploaded successfully!");
      } else {
        toast.error(res.error || "Failed to upload screenshot.");
      }
    } catch {
      toast.error("Network error uploading screenshot.");
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategory) {
      toast.error("Please select an issue category.");
      return;
    }

    if (!customNote || customNote.trim().length < 5) {
      toast.error("Additional details are required. Please describe the transaction issue (at least 5 characters).");
      return;
    }

    if (isUploadingImage) {
      toast.error("Please wait for screenshot upload to complete.");
      return;
    }

    const recipient =
      transaction.recipientName ||
      transaction.beneficiaryName ||
      transaction.senderName ||
      transaction.description ||
      "N/A";

    const payload: ReportDataPayload = {
      transactionReference: transaction.reference || transaction.id || "N/A",
      transactionId: transaction.id || transaction.reference || "N/A",
      amount: transaction.amount || 0,
      currency: transaction.currency || "NGN",
      transactionType: transaction.type || "TRANSACTION",
      transactionDate: transaction.date || new Date().toISOString(),
      recipientName: recipient,
      issueCategory: selectedCategory,
      customNote: customNote.trim(),
      screenshotUrl: screenshotUrl || undefined,
    };

    onAuthorizeAndSubmit(payload);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120000] flex items-end sm:items-center justify-center font-hanken">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        />

        {/* Slide-Up Drawer / Modal Window */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl z-[120001] max-h-[90vh] overflow-y-auto text-black"
        >
          {/* Top Grab Bar */}
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5 text-red-600">
              <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">report_problem</span>
              </div>
              <div>
                <h3 className="font-extrabold text-base text-black uppercase tracking-tight">
                  Report Transaction Issue
                </h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">
                  Ref: {transaction.reference || transaction.id || "N/A"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base font-bold">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-left">
            {/* Category Select Cards */}
            <div className="space-y-2">
              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                Select Issue Category <span className="text-red-500">*</span>
              </label>

              <div className="space-y-2">
                {ISSUE_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-red-50/80 border-red-500 text-red-700 ring-1 ring-red-500 shadow-2xs"
                          : "bg-gray-50/60 border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span className="pr-2">{cat}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? "border-red-600 bg-red-600 text-white" : "border-gray-300"
                      }`}>
                        {isSelected && <span className="material-symbols-outlined text-[10px]">check</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Additional Details (MANDATORY) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                  Additional Explanation <span className="text-red-500">* Required</span>
                </label>
                <span className="text-[10px] text-gray-400 font-semibold">
                  {customNote.length}/500
                </span>
              </div>
              <textarea
                required
                maxLength={500}
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Explain what went wrong with this transaction in detail..."
                className="w-full h-24 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-red-500 focus:bg-white transition-all resize-none"
              />
            </div>

            {/* Screenshot Upload (OPTIONAL / RECOMMENDED) */}
            <div className="space-y-2">
              <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                Attach Proof Screenshot (Optional)
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {screenshotUrl ? (
                <div className="relative rounded-2xl border border-gray-200 p-2.5 bg-gray-50 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 shrink-0 relative border">
                    <img src={screenshotUrl} alt="Screenshot proof" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-gray-800 truncate">Screenshot Attached</p>
                    <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-xs">check_circle</span> Uploaded
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreenshotUrl("")}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-gray-200 hover:border-red-400 rounded-2xl bg-gray-50/50 hover:bg-red-50/20 text-gray-600 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center gap-2 py-1">
                      <ButtonSpinner />
                      <span className="text-xs font-bold text-red-600">Uploading Screenshot ({uploadProgress}%)...</span>
                    </div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-2xl text-red-500">add_photo_alternate</span>
                      <span className="text-xs font-extrabold text-gray-700">Click to upload proof screenshot</span>
                      <span className="text-[10px] text-gray-400 font-semibold">PNG, JPG, WEBP up to 10MB</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isUploadingImage || !customNote.trim()}
                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-2xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
              >
                {isSubmitting ? (
                  <ButtonSpinner />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">lock</span>
                    <span>Authorize & Submit</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
