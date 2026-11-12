"use client";

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { AppLogo } from "@/components/AppLogo";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { useAppConfig } from "@/lib/ConfigContext";
import { Transaction } from "./TransactionReceipt";

export interface ShareReceiptModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  currencySymbol: string;
  displayAmount: number;
  statusText: string;
  formattedDateTime: string;
  recipientNameDisplay: string;
  recipientBankAndAcc: string;
  senderNameDisplay: string;
  senderBankAndAcc: string;
  txTypeDisplay: string;
  displayNarration: string;
  onClose: () => void;
}

export const ShareReceiptModal: React.FC<ShareReceiptModalProps> = ({
  isOpen,
  transaction,
  currencySymbol,
  displayAmount,
  statusText,
  formattedDateTime,
  recipientNameDisplay,
  recipientBankAndAcc,
  senderNameDisplay,
  senderBankAndAcc,
  txTypeDisplay,
  displayNarration,
  onClose,
}) => {
  const shareReceiptRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing...");
  const [isPdfDrawerOpen, setIsPdfDrawerOpen] = useState(false);
  const { config } = useAppConfig();

  // Intercept mobile/hardware back button safely using stacked history
  useModalBackHandler(isOpen, onClose, "share-receipt-modal");
  useModalBackHandler(isPdfDrawerOpen, () => setIsPdfDrawerOpen(false), "pdf-options-drawer");

  if (!isOpen || !transaction) return null;

  const sanitizeCssString = (css: string): string => {
    if (!css) return "";
    return css
      .replace(/oklab\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
      .replace(/oklch\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
      .replace(/lab\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
      .replace(/lch\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
      .replace(/color\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)");
  };

  const onCloneReceiptForHtml2Canvas = (clonedDoc: Document) => {
    const styleElements = clonedDoc.querySelectorAll("style");
    styleElements.forEach((style) => {
      try {
        if (style.innerHTML) style.innerHTML = sanitizeCssString(style.innerHTML);
        if (style.textContent) style.textContent = sanitizeCssString(style.textContent);
      } catch {}
    });

    try {
      Array.from(clonedDoc.styleSheets).forEach((sheet) => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach((rule) => {
            if (rule.cssText && /(oklab|oklch|lab|lch|color)\(/i.test(rule.cssText)) {
              const styleRule = rule as CSSStyleRule;
              if (styleRule.style && styleRule.style.cssText) {
                styleRule.style.cssText = sanitizeCssString(styleRule.style.cssText);
              }
            }
          });
        } catch {}
      });
    } catch {}

    const UNSUPPORTED_PATTERN = /(oklab|oklch|lab|lch|color)\(/i;
    const clonedElements = clonedDoc.querySelectorAll("*");
    clonedElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.hasAttribute("style")) {
        const rawStyle = htmlEl.getAttribute("style");
        if (rawStyle) htmlEl.setAttribute("style", sanitizeCssString(rawStyle));
      }
      try {
        const computed = window.getComputedStyle(htmlEl);
        if (UNSUPPORTED_PATTERN.test(computed.backgroundColor)) htmlEl.style.backgroundColor = "transparent";
        if (UNSUPPORTED_PATTERN.test(computed.color)) htmlEl.style.color = "#000000";
        if (UNSUPPORTED_PATTERN.test(computed.borderColor)) htmlEl.style.borderColor = "#E2E8F0";
      } catch {}
    });
  };

  const generateReceiptBlob = async (): Promise<Blob | null> => {
    if (!shareReceiptRef.current) return null;
    try {
      const canvas = await html2canvas(shareReceiptRef.current, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: onCloneReceiptForHtml2Canvas,
      });
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
      });
    } catch (err) {
      console.error("HTML2Canvas generation failed:", err);
      return null;
    }
  };

  const handleShareImage = async () => {
    if (generating) return;
    setGenerating(true);
    setLoadingText("Generating HD Image...");
    toast.loading("Generating shareable receipt image...", { id: "share-image" });

    try {
      const blob = await generateReceiptBlob();
      toast.dismiss("share-image");

      if (!blob) {
        toast.error("Failed to generate receipt image.");
        setGenerating(false);
        return;
      }

      const ref = transaction.reference || "transfer";
      const file = new File([blob], `Receipt_${ref}.png`, { type: "image/png" });
      const summaryText = `Transaction Receipt from ${config.appName || "E-Global Pay"}\nRef: ${ref}\nAmount: ${currencySymbol}${displayAmount.toLocaleString()}`;

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Transaction Receipt",
          text: summaryText,
          files: [file],
        });
        toast.success("Receipt shared successfully!");
      } else if (navigator.share) {
        await navigator.share({
          title: "Transaction Receipt",
          text: summaryText,
        });
        toast.success("Receipt text shared successfully!");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Receipt_${ref}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Receipt image downloaded!");
      }
    } catch (err: any) {
      toast.dismiss("share-image");
      if (err?.name !== "AbortError") {
        console.warn("Share error:", err);
        toast.error("Unable to share receipt image.");
      }
    } finally {
      setGenerating(false);
    }
  };

  // Explicit zero fee handling for share receipt modal
  const rawFee = Number(transaction.fee) || 0;
  const storedTotalDebited = Number(transaction.totalDebited) || 0;
  const isFreeTransaction = rawFee === 0 && (storedTotalDebited === 0 || storedTotalDebited === displayAmount);

  const handlePdfAction = async (action: "share" | "download") => {
    setIsPdfDrawerOpen(false);
    if (generating) return;
    setGenerating(true);
    setLoadingText(action === "share" ? "Preparing PDF for sharing..." : "Exporting PDF file...");
    toast.loading(action === "share" ? "Preparing PDF for sharing..." : "Generating PDF receipt...", { id: "pdf-action" });

    try {
      const blob = await generateReceiptBlob();
      if (!blob) {
        toast.dismiss("pdf-action");
        toast.error("Failed to compile receipt graphics.");
        setGenerating(false);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const imgDataUri = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = 170;
      const imgHeight = (280 * imgWidth) / 190;
      const xPos = (pdfWidth - imgWidth) / 2;

      pdf.addImage(imgDataUri, "PNG", xPos, 15, imgWidth, imgHeight, undefined, "FAST");

      const ref = transaction.reference || "transfer";
      const pdfFileName = `Receipt_${ref}.pdf`;

      toast.dismiss("pdf-action");

      if (action === "share") {
        const pdfBlob = pdf.output("blob");
        const pdfFile = new File([pdfBlob], pdfFileName, { type: "application/pdf" });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: "Transaction Receipt PDF",
            text: `Transaction Receipt - ${ref}`,
          });
          toast.success("PDF shared successfully!");
        } else if (navigator.share) {
          await navigator.share({
            title: "Transaction Receipt",
            text: `Transaction Receipt - ${ref}\nAmount: ${currencySymbol}${displayAmount.toLocaleString()}`,
          });
          toast.success("Receipt details shared!");
        } else {
          pdf.save(pdfFileName);
          toast.success("PDF downloaded successfully!");
        }
      } else {
        pdf.save(pdfFileName);
        toast.success("PDF downloaded successfully!");
      }
    } catch (err: any) {
      toast.dismiss("pdf-action");
      if (err?.name !== "AbortError") {
        console.error("PDF action error:", err);
        toast.error("Failed to process PDF file.");
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="fixed inset-0 w-full h-full bg-[#F5F6F8] z-[100005] flex flex-col select-none overflow-hidden text-black font-hanken"
        >
          {/* Loading Processing Overlay */}
          <AnimatePresence>
            {generating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-xs z-[100010] flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center space-y-3 max-w-xs w-full">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00B96B]">
                    <span className="material-symbols-outlined text-[28px] animate-spin">
                      progress_activity
                    </span>
                  </div>
                  <h4 className="font-hanken font-extrabold text-sm text-black">
                    Processing Receipt
                  </h4>
                  <p className="font-hanken text-xs font-semibold text-gray-500">
                    {loadingText}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Modal Top Navigation */}
          <div className="safe-top bg-[#F5F6F8] px-5 py-4 flex items-center justify-between shrink-0 border-b border-gray-200/50">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 text-gray-800 font-semibold text-base active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-2xl font-bold">arrow_back</span>
              <span>Share Receipt</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-200/60 flex items-center justify-center text-gray-700 hover:text-black transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg font-bold">close</span>
            </button>
          </div>

          {/* Ticket Card Container */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center custom-scrollbar pb-28">
            <div
              ref={shareReceiptRef}
              className="relative w-full max-w-sm bg-white rounded-[24px] p-6 shadow-sm flex flex-col space-y-4 text-black border border-gray-100/80 overflow-hidden"
            >
              {/* Optional Background Image Layer */}
              {config.receiptBgImageEnabled && config.receiptBgImageUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden rounded-[24px]">
                  <img
                    src={config.receiptBgImageUrl}
                    alt="Receipt Background"
                    style={{
                      opacity: config.receiptBgImageOpacity ?? 0.15,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )}

              {/* Top Header: App Logo & Receipt Label */}
              <div className="relative z-10 flex justify-between items-center pb-2">
                <div className="flex items-center gap-2">
                  <AppLogo size={32} />
                  <span className="font-extrabold text-lg text-black tracking-tight">{config.appName || "E-Global Pay"}</span>
                </div>
                <span className="text-xs font-semibold text-gray-500">Transaction Receipt</span>
              </div>

              {/* Amount & Status */}
              <div className="relative z-10 text-center py-2 space-y-1">
                <h1 className="font-mono text-3xl font-extrabold text-[#00B96B]">
                  {currencySymbol}{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h1>
                <p className="font-bold text-sm text-gray-900">{statusText}</p>
                <p className="text-[11px] text-gray-400 font-medium">{formattedDateTime}</p>
              </div>

              <div className="relative z-10 border-b border-gray-100" />

              {/* Transaction Details */}
              <div className="relative z-10 space-y-3.5 text-xs">
                {/* Recipient Details */}
                <div className="flex justify-between items-start">
                  <span className="text-gray-400 font-medium shrink-0 pt-0.5">Recipient Details</span>
                  <div className="text-right flex flex-col items-end pl-3">
                    <span className="font-bold text-gray-900 leading-tight">{recipientNameDisplay}</span>
                    <span className="text-gray-500 text-[11px] font-medium leading-tight mt-0.5">{recipientBankAndAcc}</span>
                  </div>
                </div>

                {/* Sender Details */}
                <div className="flex justify-between items-start">
                  <span className="text-gray-400 font-medium shrink-0 pt-0.5">Sender Details</span>
                  <div className="text-right flex flex-col items-end pl-3">
                    <span className="font-bold text-gray-900 leading-tight">{senderNameDisplay}</span>
                    <span className="text-gray-500 text-[11px] font-medium leading-tight mt-0.5">{senderBankAndAcc}</span>
                  </div>
                </div>

                {/* Transaction Type */}
                {txTypeDisplay && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-medium">Transaction Type</span>
                    <span className="font-bold text-gray-900 text-right">{txTypeDisplay}</span>
                  </div>
                )}

                {/* Remark / Narration */}
                {displayNarration && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 font-medium shrink-0">Remark</span>
                    <span className="font-bold text-gray-900 text-right pl-3 break-words max-w-[250px] leading-snug">{displayNarration}</span>
                  </div>
                )}

                {/* Transaction No. */}
                <div className="flex justify-between items-start">
                  <span className="text-gray-400 font-medium shrink-0">Transaction No.</span>
                  <span className="font-mono font-semibold text-gray-900 text-right text-[11px] pl-3 break-all">{transaction.reference}</span>
                </div>

                {/* Session ID */}
                {transaction.sessionId && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 font-medium shrink-0">Session ID</span>
                    <span className="font-mono font-semibold text-gray-900 text-right text-[11px] pl-3 break-all">{transaction.sessionId}</span>
                  </div>
                )}
              </div>

              {/* Card Disclaimer Footer */}
              <div className="relative z-10 pt-3 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 leading-relaxed font-normal">
                  {config.receiptCbnText || "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC."}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Share Actions Bar */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex items-center justify-around shadow-lg z-20">
            <button
              type="button"
              disabled={generating}
              onClick={handleShareImage}
              className="flex-1 py-3 flex items-center justify-center gap-2 text-[#00B96B] font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all rounded-xl cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg font-bold">image</span>
              <span>Share as image</span>
            </button>

            <div className="w-[1px] h-6 bg-gray-200 my-auto" />

            <button
              type="button"
              disabled={generating}
              onClick={() => setIsPdfDrawerOpen(true)}
              className="flex-1 py-3 flex items-center justify-center gap-2 text-[#00B96B] font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all rounded-xl cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg font-bold">picture_as_pdf</span>
              <span>Save as PDF</span>
            </button>
          </div>

          {/* Bottom PDF Options Drawer Modal */}
          <AnimatePresence>
            {isPdfDrawerOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsPdfDrawerOpen(false)}
                  className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[100008]"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 z-[100009] space-y-4 max-w-md mx-auto shadow-2xl"
                >
                  <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#00B96B] text-xl font-bold">
                        picture_as_pdf
                      </span>
                      <h3 className="font-hanken font-bold text-base text-black">PDF Export Options</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPdfDrawerOpen(false)}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base font-bold">close</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePdfAction("share")}
                      className="w-full py-3.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-2xl flex items-center justify-between text-emerald-800 font-extrabold text-xs uppercase tracking-wider cursor-pointer active:scale-98 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-300/40 flex items-center justify-center text-[#00B96B]">
                          <span className="material-symbols-outlined text-lg font-bold">share</span>
                        </div>
                        <div className="text-left">
                          <span className="block text-black font-extrabold text-xs uppercase">Share as PDF</span>
                          <span className="text-[10.5px] font-medium text-gray-500 lowercase">Share PDF directly via apps / WhatsApp</span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-gray-400 text-lg">chevron_right</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePdfAction("download")}
                      className="w-full py-3.5 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-2xl flex items-center justify-between text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer active:scale-98 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-200/60 border border-gray-300/40 flex items-center justify-center text-gray-700">
                          <span className="material-symbols-outlined text-lg font-bold">download</span>
                        </div>
                        <div className="text-left">
                          <span className="block text-black font-extrabold text-xs uppercase">Download as PDF</span>
                          <span className="text-[10.5px] font-medium text-gray-500 lowercase">Save PDF file directly to device storage</span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-gray-400 text-lg">chevron_right</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
