"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Transaction } from "@/components/wallet/TransactionReceipt";
import { formatTransactionDateTime } from "@/lib/date-utils";
import { isCreditTransaction, getTransactionDisplayAmount } from "@/lib/transaction-status-normalizer";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";
import { InvestmentCalendarModal } from "@/components/investment/InvestmentCalendarModal";

interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to load image as HTMLImageElement
const loadImage = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const StatementModal: React.FC<StatementModalProps> = ({ isOpen, onClose }) => {
  const { user, userData } = useAuth();
  const { config } = useAppConfig();

  // Intercept hardware and browser back button presses to close full-screen modal cleanly
  useModalBackHandler(isOpen, onClose, "statement-modal-drawer");

  // Default dates: From 1 month ago to today
  const todayStr = new Date().toISOString().split("T")[0];
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoStr = oneMonthAgo.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState<string>(oneMonthAgoStr);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [deliveryMethod, setDeliveryMethod] = useState<"download" | "email" | "share">("download");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Quick Preset State
  const [selectedPreset, setSelectedPreset] = useState<string>("30DAYS");

  // Custom Calendar Picker State
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarTarget, setCalendarTarget] = useState<"FROM" | "TO">("FROM");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // PIN modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);

  if (!isOpen) return null;

  // Preset Date Selection Handlers
  const handleSetPreset = (preset: string) => {
    setSelectedPreset(preset);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    setToDate(today);

    if (preset === "TODAY") {
      setFromDate(today);
    } else if (preset === "30DAYS") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFromDate(d.toISOString().split("T")[0]);
    } else if (preset === "60DAYS") {
      const d = new Date();
      d.setDate(d.getDate() - 60);
      setFromDate(d.toISOString().split("T")[0]);
    } else if (preset === "90DAYS") {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      setFromDate(d.toISOString().split("T")[0]);
    } else if (preset === "THIS_MONTH") {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(d.toISOString().split("T")[0]);
    } else if (preset === "LAST_MONTH") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(start.toISOString().split("T")[0]);
      setToDate(end.toISOString().split("T")[0]);
    } else if (preset === "ALL_TIME") {
      // All time setting start date back to early platform start (e.g., 2020-01-01)
      setFromDate("2020-01-01");
    }
  };

  const openCalendarFor = (target: "FROM" | "TO") => {
    setCalendarTarget(target);
    const targetDateStr = target === "FROM" ? fromDate : toDate;
    if (targetDateStr) {
      setCalendarMonth(new Date(targetDateStr));
    } else {
      setCalendarMonth(new Date());
    }
    setIsCalendarOpen(true);
  };

  const handleSelectCalendarDate = (dateStr: string) => {
    if (calendarTarget === "FROM") {
      setFromDate(dateStr);
    } else {
      setToDate(dateStr);
    }
    setSelectedPreset("CUSTOM");
  };

  const validateDates = (): { valid: boolean; startIso: string; endIso: string } => {
    if (!fromDate || !toDate) {
      toast.error("Please select both From Date and To Date.");
      return { valid: false, startIso: "", endIso: "" };
    }

    const start = new Date(fromDate + "T00:00:00.000Z");
    const end = new Date(toDate + "T23:59:59.999Z");

    if (start > end) {
      toast.error("From Date cannot be later than To Date.");
      return { valid: false, startIso: "", endIso: "" };
    }

    return { valid: true, startIso: start.toISOString(), endIso: end.toISOString() };
  };

  const handleInitiateGenerate = () => {
    const { valid } = validateDates();
    if (!valid || !user) return;
    setIsPinModalOpen(true);
  };

  const handlePinSubmit = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    const { valid, startIso, endIso } = validateDates();
    if (!valid || !user) {
      setIsPinModalOpen(false);
      return;
    }

    setIsVerifyingPin(true);
    setIsGenerating(true);
    toast.loading(deliveryMethod === "download" ? "Generating PDF Bank Statement..." : "Sending Statement to Email...", { id: "statement-gen" });

    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      // Step 1: Verify PIN / Biometric via API
      const pinRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ action: "verify", pin, isBiometricAuthenticated }),
      });

      const pinData = await pinRes.json();
      if (!pinRes.ok || !pinData.success) {
        toast.dismiss("statement-gen");
        toast.error(pinData.message || pinData.error || "Incorrect transaction PIN.");
        setIsGenerating(false);
        setIsVerifyingPin(false);
        return;
      }

      // PIN is valid! Close PIN modal
      setIsPinModalOpen(false);
      setIsVerifyingPin(false);

      if (deliveryMethod === "download" || deliveryMethod === "share") {
        // Fetch client-side Firestore transactions
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          where("createdAt", ">=", startIso),
          where("createdAt", "<=", endIso),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const txList: Transaction[] = [];
        snap.forEach((d) => {
          txList.push({ ...d.data() } as Transaction);
        });

        if (txList.length === 0) {
          toast.dismiss("statement-gen");
          toast.info("No transactions found for the selected date range.");
          setIsGenerating(false);
          return;
        }

        const userName = userData?.name || user.displayName || "E-Global Pay Customer";
        const userEmail = userData?.email || user.email || "";

        // Resolve images and watermark configs for PDF statement
        const statementLogoUrl = config.statementLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png";
        const signatureUrl = config.statementSignatureUrl || "";
        const stampUrl = config.statementStampUrl || "";
        const watermarkUrl = config.statementWatermarkUrl || "";
        const watermarkSize = config.statementWatermarkSize || 100;
        const watermarkOpacity = config.statementWatermarkOpacity ?? 0.15;

        const [logoImg, sigImg, stampImg, watermarkImg] = await Promise.all([
          loadImage(statementLogoUrl),
          loadImage(signatureUrl),
          loadImage(stampUrl),
          loadImage(watermarkUrl),
        ]);

        // Calculate Total Inflow vs Total Outflow
        let totalInflow = 0;
        let totalOutflow = 0;
        txList.forEach((tx) => {
          const displayAmt = getTransactionDisplayAmount(tx);
          if (isCreditTransaction(tx)) totalInflow += displayAmt;
          else totalOutflow += displayAmt;
        });

        // Generate PDF using jsPDF + autoTable
        const doc = new jsPDF({
          orientation: "p",
          unit: "mm",
          format: "a4",
        });

        // Brand Banner Bar
        doc.setFillColor(252, 122, 0); // #FC7A00
        doc.rect(14, 12, 182, 24, "F");

        if (logoImg) {
          try {
            doc.addImage(logoImg, "PNG", 18, 14, 20, 20);
          } catch {}
        }

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("E-GLOBAL PAY", logoImg ? 42 : 20, 23);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("OFFICIAL ELECTRONIC BANK STATEMENT OF ACCOUNT", logoImg ? 42 : 20, 29);

        // Overview Summary Box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 40, 182, 28, 3, 3, "F");

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("ACCOUNT HOLDER", 20, 47);
        doc.text("EMAIL", 85, 47);
        doc.text("STATEMENT PERIOD", 145, 47);

        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(String(userName).slice(0, 32), 20, 53);
        doc.text(String(userEmail).slice(0, 28), 85, 53);
        doc.text(`${fromDate} to ${toDate}`, 145, 53);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text("TOTAL TRANSACTIONS", 20, 60);
        doc.text("TOTAL MONEY IN", 85, 60);
        doc.text("TOTAL MONEY OUT", 145, 60);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(252, 122, 0);
        doc.text(`${txList.length} Record(s)`, 20, 65);

        doc.setTextColor(16, 185, 129);
        doc.text(`+N${totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 85, 65);

        doc.setTextColor(15, 23, 42);
        doc.text(`-N${totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 145, 65);

        // Table Body Data
        const tableBody = txList.map((tx) => {
          const { dateTime } = formatTransactionDateTime(tx.createdAt, tx.date, tx.time);
          const isCredit = isCreditTransaction(tx);
          const displayAmt = getTransactionDisplayAmount(tx);
          const sign = isCredit ? "+" : "-";

          return [
            dateTime,
            String(tx.reference || tx.id || "").slice(0, 20),
            String(tx.description || tx.title || "Transaction"),
            String(tx.type || "PAYMENT").toUpperCase(),
            `${sign}N${displayAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          ];
        });

        autoTable(doc, {
          startY: 74,
          margin: { left: 14, right: 14, top: 20, bottom: 25 },
          head: [["DATE & TIME", "REFERENCE", "DESCRIPTION", "TYPE", "AMOUNT (NGN)"]],
          body: tableBody,
          headStyles: {
            fillColor: [252, 122, 0], // #FC7A00
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
            halign: "left",
          },
          bodyStyles: {
            fontSize: 7.5,
            textColor: [15, 23, 42],
            cellPadding: 3,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 32, fontStyle: "bold" },
            2: { cellWidth: 62 },
            3: { cellWidth: 22, fontStyle: "bold" },
            4: { cellWidth: 34, halign: "right", fontStyle: "bold" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 4) {
              const rawVal = String(data.cell.raw || "");
              const isCredit = rawVal.startsWith("+");
              data.cell.styles.textColor = isCredit ? [16, 185, 129] : [15, 23, 42];
            }
          },
          didDrawPage: () => {
            if (watermarkImg) {
              try {
                const naturalWidth = watermarkImg.naturalWidth || watermarkImg.width || 100;
                const naturalHeight = watermarkImg.naturalHeight || watermarkImg.height || 100;
                const aspectRatio = naturalHeight / naturalWidth;

                let w = watermarkSize;
                let h = watermarkSize * aspectRatio;
                if (h > 240) {
                  h = 240;
                  w = 240 / aspectRatio;
                }
                const x = (210 - w) / 2;
                const y = (297 - h) / 2;

                doc.saveGraphicsState();
                const gState = new (doc as any).GState({ opacity: watermarkOpacity });
                doc.setGState(gState);
                doc.addImage(watermarkImg, "PNG", x, y, w, h);
                doc.restoreGraphicsState();
              } catch (err) {
                console.warn("[Statement Watermark Render Warning]:", err);
              }
            }
          },
        });

        let finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 200;

        if (finalY > 250) {
          doc.addPage();
          finalY = 30;
        }

        // Add Signature & Official Stamp
        if (sigImg || stampImg) {
          doc.setDrawColor(226, 232, 240);
          doc.line(14, finalY, 196, finalY);
          finalY += 6;

          if (sigImg) {
            try {
              doc.setFontSize(7.5);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(100, 116, 139);
              doc.text("AUTHORIZED SIGNATORY", 16, finalY);
              doc.addImage(sigImg, "PNG", 16, finalY + 2, 35, 16);
            } catch {}
          }

          if (stampImg) {
            try {
              doc.setFontSize(7.5);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(100, 116, 139);
              doc.text("OFFICIAL STAMP", 148, finalY);
              doc.addImage(stampImg, "PNG", 148, finalY + 2, 24, 24);
            } catch {}
          }
        }

        // Add Page Numbers
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(148, 163, 184);
          doc.text("Official E-Global Pay Automated Electronic Bank Statement • Confidential", 14, 288);
          doc.text(`Page ${i} of ${totalPages}`, 196, 288, { align: "right" });
        }

        const statementFileName = `EGlobalPay_Statement_${fromDate}_to_${toDate}.pdf`;
        const statementDataUri = doc.output("datauristring");
        const bridge =
          typeof window !== "undefined"
            ? (window as any).flutter_inappwebview
            : null;

        if (deliveryMethod === "share") {
          const pdfBlob = doc.output("blob");
          const pdfFile = new File([pdfBlob], statementFileName, { type: "application/pdf" });

          if (bridge && typeof bridge.callHandler === "function") {
            const shared = await bridge.callHandler("shareFile", {
              data: statementDataUri,
              fileName: statementFileName,
              mimeType: "application/pdf",
            });
            if (shared !== true && !shared?.success) {
              // Fallback to Web Share
              if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                  title: "Statement of Account",
                  text: `E-Global Pay Statement of Account (${fromDate} to ${toDate})`,
                  files: [pdfFile],
                });
              } else {
                doc.save(statementFileName);
              }
            }
          } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
              title: "Statement of Account",
              text: `E-Global Pay Statement of Account (${fromDate} to ${toDate})`,
              files: [pdfFile],
            });
          } else {
            // Fallback download if Web Share is not supported
            doc.save(statementFileName);
          }

          toast.dismiss("statement-gen");
          toast.success("Bank Statement PDF shared successfully!");
          onClose();
        } else {
          if (bridge && typeof bridge.callHandler === "function") {
            const saved = await bridge.callHandler("downloadBase64File", {
              data: statementDataUri,
              fileName: statementFileName,
              mimeType: "application/pdf",
            });
            if (saved !== true && !saved?.success) {
              throw new Error("Native statement download failed.");
            }
          } else {
            doc.save(statementFileName);
          }

          toast.dismiss("statement-gen");
          toast.success("Bank Statement PDF generated and downloaded successfully!");
          onClose();
        }
      } else {
        // Call S2S API route to dispatch statement to user email passing verified PIN / Biometric
        const res = await fetch("/api/history/statement/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ fromDate, toDate, pin, isBiometricAuthenticated }),
        });

        const data = await res.json();
        toast.dismiss("statement-gen");

        if (res.ok && data.success) {
          toast.success(data.message || "Statement of Account sent to your email!");
          onClose();
        } else {
          toast.error(data.error || "Failed to dispatch email statement.");
        }
      }
    } catch (err: any) {
      console.error("[Generate Statement Error]:", err);
      toast.dismiss("statement-gen");
      toast.error("Failed to generate statement: " + (err.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
      setIsVerifyingPin(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100000] bg-white flex flex-col justify-between overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 350 }}
            className="w-full h-full flex flex-col text-black max-w-md mx-auto overflow-hidden will-change-transform"
          >
            {/* Drawer Top Header Bar */}
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">description</span>
                </div>
                <div>
                  <h2 className="font-hanken font-extrabold text-base text-black uppercase tracking-wide">
                    Statement of Account
                  </h2>
                  <p className="font-hanken text-[9.5px] text-gray-400 font-bold uppercase tracking-widest">
                    Generate Financial Records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0 flex-shrink-0"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Main Full-Screen Form Container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {/* Brand Banner Card */}
              <div className="p-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] rounded-2xl text-white shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider">E-Global Pay</h3>
                  <p className="text-[10.5px] opacity-90 font-medium">Official Electronic Bank Statements</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[24px]">description</span>
                </div>
              </div>

              {/* Quick Date Range Selection Pills */}
              <div className="space-y-2">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                  Quick Date Range
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-50 rounded-2xl border border-gray-100">
                  <button
                    type="button"
                    onClick={() => handleSetPreset("TODAY")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "TODAY"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    Today
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPreset("THIS_MONTH")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "THIS_MONTH"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    This Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPreset("30DAYS")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "30DAYS"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    Last 30 Days
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPreset("LAST_MONTH")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "LAST_MONTH"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    Last Month
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPreset("90DAYS")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "90DAYS"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    Last 90 Days
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPreset("ALL_TIME")}
                    className={`py-2 text-[10px] font-extrabold uppercase rounded-xl transition-all cursor-pointer ${
                      selectedPreset === "ALL_TIME"
                        ? "bg-[#FC7A00] text-white shadow-2xs"
                        : "text-gray-600 hover:text-black"
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>

              {/* Date Selection Interactive Buttons */}
              <div className="space-y-3">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                  Select Specific Dates
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">From Date</span>
                    <button
                      type="button"
                      onClick={() => openCalendarFor("FROM")}
                      className="w-full text-left px-3.5 py-3 bg-white border border-gray-200 hover:border-[#FC7A00] rounded-xl flex items-center justify-between active:scale-98 transition-all cursor-pointer shadow-3xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="material-symbols-outlined text-[18px] text-[#FC7A00] shrink-0">calendar_month</span>
                        <span className="font-hanken text-xs font-extrabold text-black truncate">
                          {fromDate ? new Date(fromDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Select"}
                        </span>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">To Date</span>
                    <button
                      type="button"
                      onClick={() => openCalendarFor("TO")}
                      className="w-full text-left px-3.5 py-3 bg-white border border-gray-200 hover:border-[#FC7A00] rounded-xl flex items-center justify-between active:scale-98 transition-all cursor-pointer shadow-3xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="material-symbols-outlined text-[18px] text-[#FC7A00] shrink-0">event</span>
                        <span className="font-hanken text-xs font-extrabold text-black truncate">
                          {toDate ? new Date(toDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Select"}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Delivery Option Selector */}
              <div className="space-y-2">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-500 block">
                  Delivery Format / Action
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("download")}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      deliveryMethod === "download"
                        ? "border-[#FC7A00] bg-orange-50/90 text-black font-extrabold shadow-3xs"
                        : "border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">download</span>
                      {deliveryMethod === "download" && (
                        <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">check_circle</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-[11px] uppercase font-extrabold block">Download</span>
                      <span className="text-[8.5px] text-gray-400 font-semibold block">Save PDF</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("share")}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      deliveryMethod === "share"
                        ? "border-[#FC7A00] bg-orange-50/90 text-black font-extrabold shadow-3xs"
                        : "border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">share</span>
                      {deliveryMethod === "share" && (
                        <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">check_circle</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-[11px] uppercase font-extrabold block">Share PDF</span>
                      <span className="text-[8.5px] text-gray-400 font-semibold block">Send via apps</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("email")}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      deliveryMethod === "email"
                        ? "border-[#FC7A00] bg-orange-50/90 text-black font-extrabold shadow-3xs"
                        : "border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">mail</span>
                      {deliveryMethod === "email" && (
                        <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">check_circle</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-[11px] uppercase font-extrabold block">Email</span>
                      <span className="text-[8.5px] text-gray-400 font-semibold block">To inbox</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-5 border-t border-gray-100 bg-white shadow-lg flex-shrink-0">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleInitiateGenerate}
                className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 border-0"
              >
                {isGenerating ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Statement...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">
                      {deliveryMethod === "download" ? "download" : deliveryMethod === "share" ? "share" : "send"}
                    </span>
                    <span>
                      {deliveryMethod === "download"
                        ? "Download PDF Statement"
                        : deliveryMethod === "share"
                        ? "Share PDF Statement"
                        : "Send Statement to Email"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Calendar Picker Modal */}
          <InvestmentCalendarModal
            isOpen={isCalendarOpen}
            onClose={() => setIsCalendarOpen(false)}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            selectedPlan={{ minCustomDays: -36500 } as any}
            customMaturityDate={calendarTarget === "FROM" ? fromDate : toDate}
            onSelectDate={handleSelectCalendarDate}
          />

          {/* Authorization PIN Modal */}
          <InvestmentPinModal
            isOpen={isPinModalOpen}
            onClose={() => setIsPinModalOpen(false)}
            title="Authorize Statement Request"
            description="Enter your 4-digit transaction PIN to generate statement."
            isSubmitting={isVerifyingPin}
            onPinSubmit={handlePinSubmit}
          />
        </div>
      )}
    </AnimatePresence>
  );
};
