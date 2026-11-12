"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { EstateProperty } from "@/estate/types";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";

interface ReportPropertyModalProps {
  isOpen: boolean;
  property: EstateProperty | null;
  onClose: () => void;
  onSubmitReport: (
    reason: string,
    details: string,
    evidenceUrl?: string,
    reporterPhone?: string
  ) => Promise<void>;
}

export const ReportPropertyModal: React.FC<ReportPropertyModalProps> = ({
  isOpen,
  property,
  onClose,
  onSubmitReport,
}) => {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalBackHandler(isOpen, onClose, "report-property-modal");

  if (!isOpen || !property) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(5);
    try {
      const res = await uploadImageSecurely(file, "report_evidence", (percent) => {
        setUploadProgress(percent);
      });
      if (res.success && res.url) {
        setEvidenceUrl(res.url);
        toast.success("Screenshot / Evidence uploaded successfully!");
      } else {
        toast.error(res.error || "Failed to upload evidence.");
      }
    } catch {
      toast.error("Error uploading evidence photo.");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Please select or enter a reason for reporting this listing.");
      return;
    }
    if (!details.trim()) {
      toast.error("Additional details are required for report verification.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmitReport(reason, details.trim(), evidenceUrl, reporterPhone.trim());
      setReason("");
      setDetails("");
      setReporterPhone("");
      setEvidenceUrl("");
      onClose();
    } catch {
      toast.error("Failed to submit property report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[100025] bg-white w-full h-full flex flex-col justify-between overflow-y-auto no-scrollbar text-black font-hanken"
        >
          <div className="w-full max-w-lg mx-auto flex-1 flex flex-col justify-between p-4 sm:p-6 space-y-6 pb-28">
            <div>
              {/* Header Bar without Border */}
              <div className="flex items-center justify-between pb-2 pt-1">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-red-500 text-[24px]">flag</span>
                  <div>
                    <h3 className="font-extrabold text-sm text-black uppercase tracking-tight">
                      Report Listing
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[220px]">
                      {property.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 border-0 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Form Content */}
              <form id="report-property-form" onSubmit={handleSubmit} className="mt-4 space-y-4 text-left">
                <div className="p-4 bg-red-50/80 rounded-2xl border border-red-100 space-y-1">
                  <h4 className="font-extrabold text-xs text-red-600 uppercase">
                    🚩 Marketplace Safety Guarantee
                  </h4>
                  <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                    Help us keep E-Global Estate safe. Submitted reports are sent directly to platform administrators for immediate verification.
                  </p>
                </div>

                <div>
                  <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                    Select Common Reason *
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      "Fraudulent / Scam",
                      "Incorrect Price",
                      "Unavailable / Already Sold",
                      "Misleading Photos",
                      "Unresponsive Agent",
                      "Other Violation",
                    ].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReason(r)}
                        className={`py-2.5 px-3 rounded-xl text-[11px] font-bold text-left border cursor-pointer transition-all ${
                          reason === r
                            ? "bg-red-50 border-red-500 text-red-600 font-black shadow-2xs"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Specific report reason..."
                    className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-bold text-black text-xs outline-none focus:border-red-500 transition-all shadow-2xs"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                    Additional Details *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Provide required details explaining the violation or issue..."
                    className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-medium text-black text-xs outline-none focus:border-red-500 transition-all resize-none shadow-2xs"
                  />
                </div>

                {/* Emergency Phone Number */}
                <div>
                  <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                    Emergency Phone Number (Callback Verification)
                  </label>
                  <input
                    type="tel"
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-bold text-black text-xs outline-none focus:border-red-500 transition-all shadow-2xs"
                  />
                </div>

                {/* Upload Screenshot / Evidence Image */}
                <div>
                  <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                    Upload Screenshot / Evidence Image
                  </label>

                  <UploadProgressBar
                    isUploading={isUploading}
                    progress={uploadProgress}
                    label="Uploading Evidence Screenshot..."
                  />

                  <div className="flex items-center gap-3">
                    <label className="px-4 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-2xl font-bold text-xs uppercase text-gray-800 cursor-pointer flex items-center gap-2 transition-all shadow-2xs">
                      <span className="material-symbols-outlined text-[18px] text-red-500">
                        add_photo_alternate
                      </span>
                      <span>{isUploading ? "Uploading..." : evidenceUrl ? "Change Photo" : "Upload Screenshot"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>

                    {evidenceUrl && (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-emerald-800 text-xs font-bold truncate">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span className="truncate max-w-[140px]">Evidence Attached</span>
                        <button
                          type="button"
                          onClick={() => setEvidenceUrl("")}
                          className="text-red-500 hover:text-red-700 border-0 bg-transparent cursor-pointer font-bold ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>

            {/* Fixed Footer Action */}
            <div className="fixed bottom-0 left-0 right-0 z-[100030] bg-white border-t border-gray-200 p-4 shadow-lg flex justify-center">
              <div className="w-full max-w-lg flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs uppercase rounded-2xl border-0 cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="report-property-form"
                  disabled={isSubmitting}
                  className="w-2/3 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">flag</span>
                  <span>{isSubmitting ? "Submitting..." : "Submit Listing Report"}</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
