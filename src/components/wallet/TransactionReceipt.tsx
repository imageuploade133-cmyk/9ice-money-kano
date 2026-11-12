"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Image from "next/image";
import { useLogos } from "@/lib/logos-client";
import { BankLogoResolver } from "@/components/wallet/BankLogoResolver";
import { useAppConfig } from "@/lib/ConfigContext";
import { useAuth } from "@/lib/AuthContext";
import { formatTransactionDateTime } from "@/lib/date-utils";
import { resolveBankName } from "@/lib/bank-resolver";
import { getTransactionLedgerStatus } from "@/lib/transaction-status-normalizer";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { parseDataPlan } from "@/components/bills/types";
import { ShareReceiptModal } from "@/components/wallet/ShareReceiptModal";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";
import { ReportTransactionIssueModal, ReportDataPayload } from "@/components/wallet/ReportTransactionIssueModal";

export interface Transaction {
  id: string;
  userId?: string;
  reference: string;
  type: string;
  title?: string;
  category?: string;
  direction?: "CREDIT" | "DEBIT" | string;
  amount: number;
  currency?: "NGN" | "USD" | string;
  fee?: number;
  vat?: number;
  markup?: number;
  totalDebited?: number;
  totalCredited?: number;
  status: string;
  description: string;
  narration?: string;
  date: string;
  time: string;
  createdAt?: string;
  completedAt?: string;
  recipientName?: string;

  // Provider details
  provider?: string;
  providerReference?: string;
  providerTransactionId?: string;
  sessionId?: string;

  // Bank transfer
  recipientBankName?: string;
  recipientAccountNumber?: string;
  recipientBankCode?: string;
  beneficiaryName?: string;
  beneficiaryAccountNumber?: string;
  beneficiaryBankName?: string;
  beneficiaryBankCode?: string;

  // Deposit
  fundingMethod?: string;
  virtualAccountNumber?: string;
  virtualAccountBankName?: string;
  senderName?: string;
  senderAccountNumber?: string;
  senderBankName?: string;
  senderBankCode?: string;

  // Airtime / Data
  network?: string;
  phoneNumber?: string;
  itemCode?: string;
  itemName?: string;
  planName?: string;

  // Bills
  billerCode?: string;
  billerName?: string;
  billerType?: string;
  customerId?: string;
  customerName?: string;

  // Electricity
  meterNumber?: string;
  meterType?: string;
  token?: string;

  // Cable
  smartcardNumber?: string;
  packageName?: string;

  // Swap
  sourceCurrency?: string;
  sourceAmount?: number;
  destinationCurrency?: string;
  destinationAmount?: number;
  exchangeRate?: number;

  // Wallet
  walletType?: "MAIN" | "BONUS";

  // Metadata
  metadata?: Record<string, unknown>;

  // Legacy compatibility fallbacks
  bankName?: string;
  bankCode?: string;
}

interface TransactionReceiptProps {
  transaction: Transaction | null;
  onClose: () => void;
  initialShowShareModal?: boolean;
}

export const TransactionReceipt: React.FC<TransactionReceiptProps> = ({
  transaction,
  onClose,
  initialShowShareModal = false,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [showShareModal, setShowShareModal] = useState(initialShowShareModal);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReportPinModalOpen, setIsReportPinModalOpen] = useState(false);
  const [pendingReportData, setPendingReportData] = useState<ReportDataPayload | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const { getBillerLogo, getBankLogo, getStoreLogo, banks } = useLogos();
  const { config } = useAppConfig();
  const { userData } = useAuth();

  useModalBackHandler(Boolean(transaction) && !isReportModalOpen, onClose, "transaction-receipt-modal");
  useModalBackHandler(isReportModalOpen, () => setIsReportModalOpen(false), "report-issue-modal");

  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (transaction) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [transaction]);

  const handleCopy = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied successfully!`);
    }
  };

  const handleAuthorizeReportRequest = (data: ReportDataPayload) => {
    setPendingReportData(data);
    setIsReportPinModalOpen(true);
  };

  const handleExecuteReportSubmission = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    if (!pendingReportData) return;

    setIsSubmittingReport(true);
    toast.loading("Submitting transaction report...", { id: "trn-report" });

    try {
      let idToken = "";
      if (typeof window !== "undefined" && (window as any).firebaseUserToken) {
        idToken = (window as any).firebaseUserToken;
      }

      const res = await fetch("/api/transactions/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          transaction,
          issueCategory: pendingReportData.issueCategory,
          customNote: pendingReportData.customNote,
          screenshotUrl: pendingReportData.screenshotUrl,
          pin,
          isBiometricAuthenticated,
        }),
      });

      const data = await res.json();
      toast.dismiss("trn-report");

      if (res.ok && data.success) {
        toast.success("Your transaction report has been submitted successfully!");
        setIsReportPinModalOpen(false);
        setIsReportModalOpen(false);
        setPendingReportData(null);
      } else {
        toast.error(data.error || "Failed to submit report.");
      }
    } catch {
      toast.dismiss("trn-report");
      toast.error("Network error submitting report.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  if (!transaction) return null;

  const ledgerStatus = getTransactionLedgerStatus(transaction);
  const currencySymbol = transaction.currency === "USD" ? "$" : "₦";

  // Transaction Category Classification
  const txType = (transaction.type || "").toUpperCase();
  const cat = (transaction.category || "").toUpperCase();
  const desc = (transaction.description || "").toLowerCase();

  const isSwap = txType.includes("SWAP") || cat.includes("SWAP") || desc.includes("swap") || desc.includes("exchange");

  const isRefund = !isSwap && (
    txType === "REFUND" ||
    cat === "REFUND" ||
    transaction.status === "REFUND" ||
    transaction.status === "REFUNDED" ||
    desc.includes("refund") ||
    desc.includes("reversal") ||
    ledgerStatus.label === "Reversal"
  );
  const isCardRefund = isRefund && (
    cat === "CARD" ||
    txType.includes("CARD") ||
    desc.includes("virtual card") ||
    desc.includes("card issuance") ||
    desc.includes("card funding") ||
    (transaction.recipientName && transaction.recipientName.toLowerCase().includes("virtual card"))
  );

  const refUpper = (transaction.reference || "").toUpperCase();
  const bType = (transaction.billerType || (transaction.metadata as any)?.billerType || "").toLowerCase();

  const resolvedTransferToBank = resolveBankName(transaction, banks, "TRANSFER_TO");
  const resolvedTransferFromBank = resolveBankName(transaction, banks, "TRANSFER_FROM");

  const isPhoneRecipient = (rec?: string) => {
    if (!rec) return false;
    const clean = rec.replace(/\s+/g, "");
    return /^(\+?234|0)[789][01]\d{8}$/.test(clean);
  };

  const isHasBankDetails = Boolean(
    transaction.beneficiaryBankName ||
    transaction.recipientBankName ||
    transaction.beneficiaryAccountNumber ||
    transaction.recipientAccountNumber ||
    (resolvedTransferToBank && resolvedTransferToBank !== "Bank")
  );

  const isBillRefund = isRefund && !isCardRefund && (
    cat === "BILLS" || cat === "AIRTIME" || cat === "DATA" || cat === "CABLE" || cat === "ELECTRICITY" || cat === "WAEC" || cat === "VTU" ||
    txType === "BILL_REFUND" ||
    refUpper.includes("BILL") ||
    refUpper.includes("VTU") ||
    refUpper.includes("AIRTIME") ||
    refUpper.includes("DATA") ||
    refUpper.includes("CABLE") ||
    refUpper.includes("ELEC") ||
    refUpper.includes("WAEC") ||
    Boolean(transaction.billerCode) ||
    Boolean(transaction.billerType) ||
    Boolean(transaction.network) ||
    Boolean(transaction.phoneNumber) ||
    Boolean(transaction.meterNumber) ||
    Boolean(transaction.smartcardNumber) ||
    desc.includes("bill") ||
    desc.includes("airtime") ||
    desc.includes("data") ||
    desc.includes("recharge") ||
    desc.includes("electricity") ||
    desc.includes("meter") ||
    desc.includes("cable") ||
    desc.includes("dstv") ||
    desc.includes("gotv") ||
    desc.includes("startimes") ||
    desc.includes("waec") ||
    desc.includes("vtu") ||
    (!isHasBankDetails && isPhoneRecipient(transaction.recipientName)) ||
    (!isHasBankDetails && isPhoneRecipient(transaction.customerId))
  );

  const isDataRefund = isBillRefund && (
    refUpper.includes("DATA") ||
    bType === "data" ||
    cat === "DATA" ||
    desc.includes("data") ||
    desc.includes("gig") ||
    desc.includes("sme")
  );

  const isAirtimeRefund = isBillRefund && !isDataRefund && (
    refUpper.includes("AIR") ||
    refUpper.includes("VTU-AIR") ||
    bType === "airtime" ||
    cat === "AIRTIME" ||
    desc.includes("airtime") ||
    desc.includes("recharge") ||
    desc.includes("top-up") ||
    desc.includes("topup") ||
    (!isHasBankDetails && isPhoneRecipient(transaction.recipientName)) ||
    (!isHasBankDetails && isPhoneRecipient(transaction.phoneNumber)) ||
    (!isHasBankDetails && isPhoneRecipient(transaction.customerId)) ||
    Boolean(transaction.network)
  );

  const isElectricityRefund = isBillRefund && !isAirtimeRefund && !isDataRefund && (
    refUpper.includes("ELEC") ||
    bType === "electricity" || bType === "utility" ||
    cat === "ELECTRICITY" ||
    Boolean(transaction.meterNumber) ||
    desc.includes("electricity") ||
    desc.includes("meter") ||
    desc.includes("disco")
  );

  const isCableRefund = isBillRefund && !isAirtimeRefund && !isDataRefund && !isElectricityRefund && (
    refUpper.includes("CABLE") ||
    bType === "cable" ||
    cat === "CABLE" ||
    Boolean(transaction.smartcardNumber) ||
    desc.includes("cable") ||
    desc.includes("dstv") ||
    desc.includes("gotv") ||
    desc.includes("startimes")
  );

  const isWaecRefund = isBillRefund && !isAirtimeRefund && !isDataRefund && !isElectricityRefund && !isCableRefund && (
    refUpper.includes("WAEC") ||
    bType === "waec" ||
    cat === "WAEC" ||
    desc.includes("waec") ||
    desc.includes("exam")
  );

  const isStore = !isRefund && (txType.includes("STORE") || cat.includes("STORE") || desc.includes("store"));
  const isAirtime = !isSwap && !isRefund && (txType === "AIRTIME" || cat === "AIRTIME" || desc.includes("airtime") || desc.includes("recharge"));
  const isData = !isSwap && !isRefund && (txType === "DATA" || cat === "DATA" || desc.includes("data") || desc.includes("gig") || desc.includes("sme"));
  const isCable = !isSwap && !isRefund && (txType === "CABLE" || cat === "CABLE" || desc.includes("cable") || desc.includes("dstv") || desc.includes("gotv") || desc.includes("startimes"));
  const isElectricity = !isSwap && !isRefund && (txType === "ELECTRICITY" || cat === "ELECTRICITY" || desc.includes("electricity") || desc.includes("meter"));
  const isWaec = !isSwap && !isRefund && (txType === "WAEC" || cat === "WAEC" || desc.includes("waec") || desc.includes("exam"));
  const isBill = !isSwap && !isRefund && (isAirtime || isData || isCable || isElectricity || isWaec || txType === "BILLS" || cat === "BILLS" || txType === "BILL_PAYMENT");

  const isBulkTransfer = !isSwap && !isRefund && (
    (transaction.metadata && Boolean(transaction.metadata.isBulk)) ||
    desc.includes("bulk") ||
    (transaction.recipientName && transaction.recipientName.toLowerCase().includes("bulk"))
  );
  const isTransfer = !isSwap && !isRefund && !isBulkTransfer && (txType === "TRANSFER" || cat === "TRANSFER" || txType === "WITHDRAWAL" || (desc.includes("transfer") && !desc.includes("bank transfer") && !desc.includes("virtual account")));
  const isHeldDeposit = transaction.status === "HELD_LIMIT_EXCEEDED" || transaction.status === "HELD" || Boolean(transaction.metadata?.isHeldDeposit && !transaction.metadata?.wasHeldReleased);
  const isDeposit = !isSwap && !isRefund && (txType === "DEPOSIT" || cat === "DEPOSIT" || txType === "VIRTUAL_ACCOUNT_DEPOSIT" || txType === "CASHOUT" || desc.includes("deposit") || desc.includes("virtual account") || isHeldDeposit);
  const isInvestment = !isSwap && !isRefund && (txType === "INVESTMENT" || cat === "INVESTMENT" || desc.includes("investment") || desc.includes("fixed deposit"));

  // Pure presentation values
  const rawFee = Number(transaction.fee) || 0;
  const vat = Number(transaction.vat) || 0;
  const markup = Number(transaction.markup) || 0;

  const storedTotalDebited = Number(transaction.totalDebited) || 0;
  let combinedTransferFee = rawFee;
  if (rawFee === 0 && (storedTotalDebited === 0 || storedTotalDebited === transaction.amount)) {
    combinedTransferFee = 0;
  } else if (markup > 0) {
    combinedTransferFee = (rawFee > markup && rawFee >= markup + 5) ? rawFee : (rawFee + markup);
  } else if (storedTotalDebited > transaction.amount) {
    combinedTransferFee = Math.max(0, storedTotalDebited - transaction.amount - vat);
  }

  const fee = combinedTransferFee;
  const totalDebited = (storedTotalDebited > 0 && storedTotalDebited >= transaction.amount + fee + vat)
    ? storedTotalDebited
    : (transaction.amount + fee + vat);

  // Phone Number Resolution for VTU Airtime and Data
  const resolveAirtimePhoneNumber = (tx: Transaction): string | null => {
    if (tx.phoneNumber && tx.phoneNumber.trim() && tx.phoneNumber !== "Not available") {
      return tx.phoneNumber.trim();
    }
    if (tx.customerId && tx.customerId.trim() && tx.customerId !== "Not available") {
      return tx.customerId.trim();
    }

    const meta = (tx.metadata || {}) as Record<string, any>;
    const metaPhone = meta.phoneNumber || meta.phone || meta.mobile_number || meta.mobile || meta.customer_id || meta.recipient || meta.phone_number;
    if (typeof metaPhone === "string" && metaPhone.trim()) {
      return metaPhone.trim();
    }

    if (tx.recipientName && tx.recipientName.trim()) {
      const cleanRec = tx.recipientName.trim();
      if (/^(\+?234|0)[789][01]\d{8}$/.test(cleanRec.replace(/\s+/g, ""))) {
        return cleanRec;
      }
    }

    const textSearch = `${tx.description || ""} ${tx.narration || ""} ${tx.title || ""} ${tx.reference || ""}`;
    const phoneMatch = textSearch.match(/(?:\+?234|0)[789][01]\d{8}/);
    if (phoneMatch) {
      return phoneMatch[0];
    }

    if (tx.recipientName && /\d{10,14}/.test(tx.recipientName)) {
      const match = tx.recipientName.match(/\d{10,14}/);
      if (match) return match[0];
    }

    return null;
  };

  const resolvedMobileNumber = resolveAirtimePhoneNumber(transaction);

  const resolveNarrationDisplay = (tx: Transaction): string | null => {
    if (tx.narration && tx.narration.trim()) {
      const trimmed = tx.narration.trim();
      const lower = trimmed.toLowerCase();
      if (!lower.startsWith("transfer to ") && !lower.startsWith("transfer of ")) {
        return trimmed;
      }
    }
    if (tx.description && tx.description.trim()) {
      const trimmedDesc = tx.description.trim();
      const lowerDesc = trimmedDesc.toLowerCase();
      if (!lowerDesc.startsWith("transfer to ") && !lowerDesc.startsWith("transfer of ") && !lowerDesc.startsWith("wallet funding") && !lowerDesc.startsWith("wallet provisioning")) {
        return trimmedDesc;
      }
    }
    return null;
  };

  const displayNarration = resolveNarrationDisplay(transaction);

  // Logo Resolution
  const receiptHeaderName = config.receiptName || "E-TECH GLOBAL HUB";
  const receiptHeaderLogo = config.receiptLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png";

  const detectedNetworkName = transaction.network || transaction.billerName || (
    transaction.billerCode && !transaction.billerCode.toLowerCase().includes("vtu") && !transaction.billerCode.toLowerCase().includes("bill")
      ? transaction.billerCode
      : ""
  ) || (
    desc.includes("mtn") ? "MTN" :
    desc.includes("glo") ? "GLO" :
    desc.includes("airtel") ? "Airtel" :
    desc.includes("9mobile") ? "9mobile" :
    desc.includes("kedco") || desc.includes("kano") ? "KEDCO" :
    desc.includes("ikedc") || desc.includes("ikeja") ? "IKEDC" :
    desc.includes("ekedc") || desc.includes("eko") ? "EKEDC" :
    desc.includes("aedc") || desc.includes("abuja") ? "AEDC" :
    desc.includes("ibedc") || desc.includes("ibadan") ? "IBEDC" :
    desc.includes("phhedc") || desc.includes("port harcourt") ? "PHED" :
    desc.includes("eedc") || desc.includes("enugu") ? "EEDC" :
    desc.includes("jedc") || desc.includes("jos") ? "JED" :
    desc.includes("kaedco") || desc.includes("kaduna") ? "KAEDCO" :
    desc.includes("betting") || desc.includes("sporty") || desc.includes("1xbet") || desc.includes("bet9ja") || desc.includes("nairabet") || desc.includes("msport") ? "Betting" :
    desc.includes("dstv") ? "DSTV" :
    desc.includes("gotv") ? "GOtv" :
    desc.includes("startimes") ? "Startimes" :
    desc.includes("waec") ? "WAEC" : ""
  );

  const matchedLogo = isStore
    ? (getBillerLogo("store") || getStoreLogo())
    : isSwap
    ? getBillerLogo("swap")
    : isInvestment
    ? getBillerLogo("investment")
    : isDeposit
    ? (getBillerLogo("deposit") || getBillerLogo("Cash Deposit") || getBankLogo(resolvedTransferFromBank))
    : (isBill || isBillRefund)
    ? (getBillerLogo(detectedNetworkName) || getBillerLogo(transaction.billerName || "") || getBillerLogo(desc))
    : (getBankLogo(resolvedTransferToBank) || getBankLogo(desc));

  const logoUrl = matchedLogo || receiptHeaderLogo;

  // Data Plan details parsing
  const fullPlanString = transaction.planName || transaction.itemName || transaction.description || "";
  const parsedPlanData = parseDataPlan(fullPlanString);
  const dataPlanSize = parsedPlanData.size && parsedPlanData.size !== "Data Plan" ? parsedPlanData.size : (transaction.planName || "Data Package");
  const dataPlanValidity = (transaction.metadata as any)?.validity || (transaction.metadata as any)?.duration || parsedPlanData.duration || "30 Days";

  // Account Number Masking Helper for Share Receipt (e.g. 807****034 or 969****144)
  const maskAccountNum = (acc?: string | null): string => {
    if (!acc) return "";
    const clean = String(acc).replace(/\D/g, "");
    if (clean.length <= 4) return clean;
    if (clean.length === 10) {
      return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
    }
    return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
  };

  // Real Sender Name Resolution
  const resolveRealSenderName = (): string | null => {
    const candidate = transaction.senderName;
    if (!candidate || typeof candidate !== "string") return null;
    const trimmedCandidate = candidate.trim();
    if (trimmedCandidate.length === 0) return null;
    return trimmedCandidate;
  };

  const displaySenderName = resolveRealSenderName();

  const resolvedSenderBank = resolveBankName(
    {
      senderBankName: transaction.senderBankName,
      senderBankCode: transaction.senderBankCode,
    },
    banks,
    "TRANSFER_FROM"
  );

  const resolvedReceivingBank = resolveBankName(
    {
      virtualAccountBankName: transaction.virtualAccountBankName,
      recipientBankName: transaction.recipientBankName || transaction.virtualAccountBankName,
      recipientBankCode: transaction.recipientBankCode || transaction.beneficiaryBankCode,
    },
    banks,
    "TRANSFER_TO"
  );

  const displayReceivingBank = resolvedReceivingBank !== "Bank"
    ? resolvedReceivingBank
    : (transaction.virtualAccountBankName || "Bank information unavailable");

  // Share Receipt Fields Resolution
  let recipientNameDisplay = "";
  let recipientBankAndAcc = "";
  let senderNameDisplay = "";
  let senderBankAndAcc = "";
  let txTypeDisplay = "";

  const userFullName = String((userData as any)?.fullName || (userData as any)?.name || "");

  if (isDeposit) {
    txTypeDisplay = "Bank Deposit";

    recipientNameDisplay = userFullName || transaction.recipientName || "E-Global User";
    const recBank = displayReceivingBank !== "Bank" ? displayReceivingBank : (config.appName || "E-Global Pay");
    const recAcc = maskAccountNum(transaction.virtualAccountNumber || userData?.virtualAccountNumber);
    recipientBankAndAcc = recAcc ? `${recBank} | ${recAcc}` : recBank;

    senderNameDisplay = displaySenderName || transaction.senderName || "Bank Transfer Sender";
    const sendBank = resolvedSenderBank !== "Bank" ? resolvedSenderBank : (transaction.senderBankName || "Bank");
    const sendAcc = maskAccountNum(transaction.senderAccountNumber);
    senderBankAndAcc = sendAcc ? `${sendBank} | ${sendAcc}` : sendBank;
  } else if (isTransfer) {
    txTypeDisplay = "Bank Transfer";

    recipientNameDisplay = transaction.beneficiaryName || transaction.recipientName || "Beneficiary";
    const recBank = resolvedTransferToBank !== "Bank" ? resolvedTransferToBank : (transaction.recipientBankName || "Bank");
    const recAcc = transaction.beneficiaryAccountNumber || transaction.recipientAccountNumber;
    recipientBankAndAcc = recAcc ? `${recBank} | ${recAcc}` : recBank;

    senderNameDisplay = userFullName || transaction.senderName || config.appName || "E-Global Pay User";
    const sendBank = config.appName || "E-Global Pay";
    const sendAcc = userData?.virtualAccountNumber || userData?.accountNumber || transaction.senderAccountNumber;
    senderBankAndAcc = sendAcc ? `${sendBank} | ${sendAcc}` : sendBank;
  } else if (isBill || isAirtime || isData || isElectricity || isCable || isWaec) {
    txTypeDisplay = isAirtime ? "Airtime Top-up" : isData ? "Data Bundle" : isElectricity ? "Electricity Utility" : isCable ? "Cable TV" : isWaec ? "WAEC Purchase" : "Bill Payment";

    recipientNameDisplay = detectedNetworkName || transaction.billerName || "Service Provider";
    const targetNum = resolvedMobileNumber || transaction.phoneNumber || transaction.meterNumber || transaction.smartcardNumber || transaction.customerId;
    const maskedTarget = maskAccountNum(targetNum);
    recipientBankAndAcc = maskedTarget ? `${recipientNameDisplay} | ${maskedTarget}` : recipientNameDisplay;

    senderNameDisplay = userFullName || config.appName || "E-Global Pay User";
    const sendAcc = maskAccountNum(userData?.virtualAccountNumber || userData?.accountNumber);
    senderBankAndAcc = sendAcc ? `${config.appName || "E-Global Pay"} | ${sendAcc}` : (config.appName || "E-Global Pay");
  } else if (isStore) {
    txTypeDisplay = "Store Purchase";

    recipientNameDisplay = transaction.billerName || config.appName || "E-Global Store";
    recipientBankAndAcc = `${config.appName || "E-Global Store"} | Store Order`;

    senderNameDisplay = userFullName || "E-Global Customer";
    const sendAcc = maskAccountNum(userData?.virtualAccountNumber || userData?.accountNumber);
    senderBankAndAcc = sendAcc ? `${config.appName || "E-Global Pay"} | ${sendAcc}` : (config.appName || "E-Global Pay");
  } else if (isSwap) {
    txTypeDisplay = "Currency Swap";

    recipientNameDisplay = `${transaction.destinationCurrency || "USD"} Wallet`;
    recipientBankAndAcc = `Currency Exchange`;

    senderNameDisplay = userFullName || "E-Global Customer";
    senderBankAndAcc = `${transaction.sourceCurrency || "NGN"} Wallet`;
  } else if (isRefund) {
    txTypeDisplay = "Transaction Reversal";

    recipientNameDisplay = userFullName || "E-Global User";
    const recAcc = maskAccountNum(userData?.virtualAccountNumber || userData?.accountNumber);
    recipientBankAndAcc = recAcc ? `${config.appName || "E-Global Pay"} | ${recAcc}` : (config.appName || "E-Global Pay");

    senderNameDisplay = transaction.beneficiaryName || transaction.recipientName || detectedNetworkName || "Reversal Service";
    senderBankAndAcc = "Reversal Refund";
  } else {
    txTypeDisplay = "Payment Transaction";

    recipientNameDisplay = transaction.recipientName || transaction.beneficiaryName || "Recipient";
    recipientBankAndAcc = resolvedTransferToBank !== "Bank" ? resolvedTransferToBank : (config.appName || "E-Global Pay");

    senderNameDisplay = userFullName || "Sender";
    senderBankAndAcc = config.appName || "E-Global Pay";
  }

  const displayAmount = (isHeldDeposit ? (Number(transaction.metadata?.heldAmount) || transaction.amount) : isRefund ? (Number(transaction.totalCredited) || (transaction.amount + fee + vat)) : transaction.amount);
  const formattedDateTime = formatTransactionDateTime(transaction.createdAt, transaction.date, transaction.time).dateTime;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 w-full h-full bg-gray-50 z-[100000] flex flex-col select-none overflow-hidden"
      >
        {/* Sticky Header */}
        <div className="safe-top bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center shrink-0 shadow-3xs">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 hover:text-black active:scale-90 transition-all cursor-pointer shadow-3xs"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
          </button>
          <div className="text-center">
            <h2 className="font-hanken font-bold text-base text-black">
              Transaction Details
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="w-10 h-10 rounded-full border border-red-200 bg-red-50/80 flex items-center justify-center text-red-600 hover:bg-red-100 active:scale-90 transition-all cursor-pointer shadow-3xs"
            title="Report Transaction Issue"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">flag</span>
          </button>
        </div>

        {/* Scrollable Transaction Specifications Canvas */}
        <div className="flex-1 overflow-y-auto p-margin-mobile flex flex-col items-center custom-scrollbar pb-28">
          <div
            ref={receiptRef}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-sm flex flex-col space-y-5 text-black"
          >
            {/* Header / Logo */}
            <div className="text-center border-b border-dashed border-gray-200 pb-5 space-y-3">
              <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                {isTransfer ? (
                  <BankLogoResolver
                    bankName={resolvedTransferToBank}
                    bankCode={transaction.beneficiaryBankCode || transaction.recipientBankCode || transaction.bankCode}
                    className="w-14 h-14"
                    size={48}
                    iconSizeClassName="text-[28px]"
                  />
                ) : isDeposit ? (
                  <BankLogoResolver
                    bankName={resolvedTransferFromBank}
                    bankCode={transaction.senderBankCode || transaction.bankCode}
                    className="w-14 h-14"
                    size={48}
                    iconSizeClassName="text-[28px]"
                  />
                ) : (
                  <div className="relative w-14 h-14 bg-gray-50 rounded-full border border-gray-100 p-1 flex items-center justify-center overflow-hidden shadow-3xs">
                    <Image
                      src={logoUrl}
                      alt="Receipt Logo"
                      fill
                      className="object-contain p-1.5"
                    />
                  </div>
                )}
              </div>

              <div>
                <p className="font-hanken font-extrabold text-[10.5px] uppercase tracking-widest text-gray-400">
                  {receiptHeaderName}
                </p>
                <h2 className="font-hanken font-bold text-sm text-gray-800 leading-snug mt-0.5">
                  {isHeldDeposit
                    ? "Deposit Held Safely"
                    : txType === "STORE_ORDER_REFUND" || desc.includes("order cancel") || desc.includes("cancel & refund")
                    ? "Order Cancel & Refund"
                    : isRefund
                    ? (isCardRefund
                        ? `Refund for Failed ${transaction.beneficiaryName || transaction.recipientName || "Virtual Card Issuing"}`
                        : isAirtimeRefund
                        ? `Refund for Failed Airtime Purchase${detectedNetworkName ? ` (${detectedNetworkName})` : ""}`
                        : isDataRefund
                        ? `Refund for Failed Data Recharge${detectedNetworkName ? ` (${detectedNetworkName})` : ""}`
                        : isElectricityRefund
                        ? `Refund for Failed Electricity Payment${transaction.billerName ? ` (${transaction.billerName})` : ""}`
                        : isCableRefund
                        ? `Refund for Failed Cable Subscription${transaction.billerName ? ` (${transaction.billerName})` : ""}`
                        : isWaecRefund
                        ? "Refund for Failed WAEC Scratch Card Purchase"
                        : isBillRefund
                        ? "Refund for Failed Bill Payment"
                        : `Reversal for Failed ${transaction.beneficiaryName || transaction.recipientName ? `Transfer to ${transaction.beneficiaryName || transaction.recipientName}` : "Transaction"}`)
                    : isSwap
                    ? "Currency Exchange Swap"
                    : isDeposit
                    ? (transaction.title || "Wallet Funding")
                    : isBulkTransfer
                    ? (`Transfer To ${transaction.recipientName || "Bulk Recipients"}`)
                    : isTransfer
                    ? (`Transfer To ${transaction.beneficiaryName || transaction.recipientName || "Beneficiary"}`)
                    : isAirtime
                    ? "Airtime Top-up"
                    : isData
                    ? "Data Bundle Recharge"
                    : isElectricity
                    ? "Electricity Utility Tokens"
                    : isCable
                    ? "Cable TV Subscription"
                    : isWaec
                    ? "WAEC Scratch Card Pin"
                    : isStore
                    ? "Store Order Payment"
                    : "Payment Transaction"}
                </h2>
                <h1 className="font-mono text-3xl font-black text-black tracking-tight mt-1">
                  {currencySymbol}
                  {displayAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </h1>
              </div>

              {/* Official Status Badge */}
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold leading-none">
                <div className={cn("flex items-center gap-1 px-3.5 py-1.5 rounded-full border", ledgerStatus.badgeBg, ledgerStatus.badgeText, ledgerStatus.badgeBorder)}>
                  <span className="material-symbols-outlined text-sm font-bold">{ledgerStatus.icon}</span>
                  <span>{ledgerStatus.label}</span>
                </div>
              </div>
            </div>

            {/* Held Deposit Explanation Banner */}
            {isHeldDeposit && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-1 text-center">
                <span className="material-symbols-outlined text-amber-600 text-2xl font-bold">lock_clock</span>
                <p className="font-hanken font-extrabold text-xs text-amber-900 uppercase tracking-wider">Funds Held Safely</p>
                <p className="font-hanken text-[11px] text-amber-800 font-semibold leading-relaxed">
                  {transaction.narration || (transaction.metadata as any)?.heldReason || "This deposit exceeded your account Tier limit. Upgrade your account level to release these funds into your spendable balance."}
                </p>
              </div>
            )}

            {/* Type-Aware Structured Details */}
            <div className="space-y-4">
              <h3 className="font-hanken font-extrabold text-[10.5px] text-gray-400 uppercase tracking-widest leading-none">
                Payment Specifications
              </h3>

              <div className="space-y-3 text-xs">
                {/* 1. BULK BANK TRANSFER */}
                {isBulkTransfer && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Transfer Type</span>
                      <span className="text-black font-bold uppercase text-right">
                        Bulk Outward Transfer
                      </span>
                    </div>

                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Recipients Count</span>
                      <span className="text-black font-bold text-right">
                        {String(transaction.metadata?.recipientCount || (Array.isArray(transaction.metadata?.bulkRecipients) ? (transaction.metadata?.bulkRecipients as any[]).length : "Multiple"))} Recipients
                      </span>
                    </div>

                    {/* Breakdown of Individual Bulk Recipients */}
                    {Array.isArray(transaction.metadata?.bulkRecipients) && (transaction.metadata?.bulkRecipients as any[]).length > 0 && (
                      <div className="p-3 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-2.5 my-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Recipient Breakdown</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {(transaction.metadata?.bulkRecipients as any[]).map((rec: any, idx: number) => {
                            const recBankName = resolveBankName({ recipientBankCode: rec.bankCode }, banks);
                            return (
                              <div key={idx} className="flex justify-between items-center text-xs pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                                <div className="flex items-center gap-2">
                                  <BankLogoResolver
                                    bankName={recBankName}
                                    bankCode={rec.bankCode}
                                    className="w-5 h-5 shrink-0"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-bold text-black text-[11px]">
                                      {recBankName}
                                    </span>
                                    {rec.accountNumber && (
                                      <span className="font-mono text-gray-500 text-[10px]">
                                        Acc: {rec.accountNumber}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-mono text-black font-bold text-right">
                                  {currencySymbol}{Number(rec.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Total Principal Sent</span>
                      <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Provider & Service Fee</span>
                      <span className="text-black font-bold">{currencySymbol}{fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    {vat > 0 && (
                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>VAT</span>
                        <span className="text-black font-bold">{currencySymbol}{vat.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Debited</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 2. STORE ORDER CANCELLATION REFUND */}
                {(txType === "STORE_ORDER_REFUND" || (isRefund && (isStore || desc.includes("store order") || desc.includes("order cancel")))) && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Canceled Order ID</span>
                      <span className="font-mono text-black font-bold uppercase select-all">
                        {(transaction as any).canceledOrderId || (transaction as any).orderId || transaction.reference.replace("REFUND-", "")}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Total Amount Deducted</span>
                      <span className="text-black font-bold">{currencySymbol}{(Number(transaction.totalDebited) || transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Total Amount Refunded</span>
                      <span className="text-emerald-600 font-black">{currencySymbol}{(Number(transaction.totalCredited) || transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Credited To</span>
                      <span className="text-black font-bold">Available Balance</span>
                    </div>

                    {/* Canceled Purchased Items Breakdown */}
                    {Array.isArray((transaction as any).items) && ((transaction as any).items as any[]).length > 0 && (
                      <div className="p-3 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-2.5 my-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Canceled Items List</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {((transaction as any).items as any[]).map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.title} className="w-7 h-7 object-contain rounded-lg border border-gray-200 bg-white shrink-0" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-bold text-black text-[11px] truncate">
                                    {item.title}
                                  </span>
                                  <span className="text-gray-500 text-[10px]">
                                    {item.quantity} x {currencySymbol}{Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                              <span className="font-mono text-black font-bold text-right shrink-0">
                                {currencySymbol}{Number((item.price || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 3. STORE ORDER PURCHASE */}
                {isStore && !isRefund && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Order ID</span>
                      <span className="font-mono text-black font-bold uppercase select-all">
                        {(transaction as any).orderId || transaction.reference}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Payment Status</span>
                      <span className="text-emerald-600 font-bold uppercase">
                        {(transaction as any).paymentStatus || "PAID"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Order Status</span>
                      <span className="text-black font-bold uppercase">
                        {(transaction as any).orderStatus || transaction.status || "Pending"}
                      </span>
                    </div>

                    {/* Purchased Items List */}
                    {Array.isArray((transaction as any).items) && ((transaction as any).items as any[]).length > 0 && (
                      <div className="p-3 bg-gray-50/80 border border-gray-100 rounded-2xl space-y-2.5 my-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Purchased Items</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {((transaction as any).items as any[]).map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                {item.imageUrl && (
                                  <img src={item.imageUrl} alt={item.title} className="w-7 h-7 object-contain rounded-lg border border-gray-200 bg-white shrink-0" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="font-bold text-black text-[11px] truncate">
                                    {item.title}
                                  </span>
                                  <span className="text-gray-500 text-[10px]">
                                    {item.quantity} x {currencySymbol}{Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                              <span className="font-mono text-black font-bold text-right shrink-0">
                                {currencySymbol}{Number((item.price || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Amount Deducted</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 4. SINGLE BANK TRANSFER */}
                {isTransfer && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Sender Details</span>
                      <div className="flex flex-col items-end text-right max-w-[220px]">
                        <span className="text-black font-bold uppercase">
                          {userFullName || transaction.senderName || config.appName || "E-Global Pay User"}
                        </span>
                        <span className="text-black font-extrabold text-xs tracking-tight mt-0.5">
                          {config.appName || "E-Global Pay"}
                        </span>
                        {(userData?.virtualAccountNumber || userData?.accountNumber || transaction.senderAccountNumber) && (
                          <span className="font-mono text-gray-600 font-bold text-[11px] mt-0.5">
                            Account: {userData?.virtualAccountNumber || userData?.accountNumber || transaction.senderAccountNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Recipient Details</span>
                      <div className="flex flex-col items-end text-right max-w-[220px]">
                        <span className="text-black font-bold uppercase">
                          {transaction.beneficiaryName || transaction.recipientName || "Not available"}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <BankLogoResolver
                            bankName={resolvedTransferToBank}
                            bankCode={transaction.beneficiaryBankCode || transaction.recipientBankCode || transaction.bankCode}
                            className="w-5 h-5 shrink-0"
                          />
                          <span className="text-black font-extrabold text-xs tracking-tight">
                            {resolvedTransferToBank}
                          </span>
                        </div>
                        {(transaction.beneficiaryAccountNumber || transaction.recipientAccountNumber) && (
                          <span className="font-mono text-gray-600 font-bold text-[11px] mt-0.5">
                            Account: {transaction.beneficiaryAccountNumber || transaction.recipientAccountNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Category</span>
                      <span className="text-black font-bold">Transfer</span>
                    </div>

                    {displayNarration && (
                      <div className="flex justify-between items-start text-gray-500 font-semibold">
                        <span>Narration</span>
                        <span className="text-black font-bold text-right pl-3 break-words max-w-[220px]">{displayNarration}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Amount</span>
                      <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Transfer Fee</span>
                      <span className="text-black font-bold font-mono">
                        {fee > 0 ? `${currencySymbol}${fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${currencySymbol}0.00 (Free)`}
                      </span>
                    </div>

                    {vat > 0 && (
                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>VAT</span>
                        <span className="text-black font-bold">{currencySymbol}{vat.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Debited</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 5. AIRTIME & DATA BILL DETAILS WITH NETWORK LOGO */}
                {(isAirtime || isData) && (
                  <>
                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Network Provider</span>
                      <div className="flex items-center gap-1.5">
                        {logoUrl && (
                          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-100 bg-white shrink-0">
                            <Image src={logoUrl} alt="Network Logo" fill className="object-contain p-0.5" />
                          </div>
                        )}
                        <span className="text-black font-extrabold uppercase">{detectedNetworkName || "Network"}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Mobile Number</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-black font-bold">
                          {resolvedMobileNumber || "Not available"}
                        </span>
                        {resolvedMobileNumber && (
                          <button
                            type="button"
                            onClick={() => handleCopy(resolvedMobileNumber, "Phone number")}
                            className="text-[#FC7A00]"
                          >
                            <span className="material-symbols-outlined text-[12px] font-bold">content_copy</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isData && (
                      <>
                        <div className="flex justify-between items-start text-gray-500 font-semibold">
                          <span>Data Plan</span>
                          <span className="text-black font-bold text-right max-w-[180px] truncate">
                            {dataPlanSize}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Plan Duration / Validity</span>
                          <span className="text-black font-bold uppercase">{dataPlanValidity}</span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Amount</span>
                      <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Debited</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 6. ELECTRICITY */}
                {isElectricity && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>DISCO Operator</span>
                      <div className="flex items-center gap-1.5">
                        {logoUrl && (
                          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-100 bg-white shrink-0">
                            <Image src={logoUrl} alt="DISCO Logo" fill className="object-contain p-0.5" />
                          </div>
                        )}
                        <span className="text-black font-extrabold uppercase">{transaction.billerName || "Electricity Provider"}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Meter Number</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-black font-bold">
                          {transaction.meterNumber || transaction.customerId || "Not available"}
                        </span>
                        {(transaction.meterNumber || transaction.customerId) && (
                          <button
                            type="button"
                            onClick={() => handleCopy(transaction.meterNumber || transaction.customerId!, "Meter number")}
                            className="text-[#FC7A00]"
                          >
                            <span className="material-symbols-outlined text-[12px] font-bold">content_copy</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {transaction.customerName && (
                      <div className="flex justify-between items-start text-gray-500 font-semibold">
                        <span>Customer Name</span>
                        <span className="text-black font-bold text-right uppercase">{transaction.customerName}</span>
                      </div>
                    )}

                    {transaction.token && (
                      <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-2xl space-y-1 my-1">
                        <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider block">Meter Token Code</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-black text-black tracking-widest">{transaction.token}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(transaction.token!, "Meter token")}
                            className="text-[#FC7A00] hover:brightness-90 active:scale-90"
                          >
                            <span className="material-symbols-outlined text-sm font-bold">content_copy</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Amount Paid</span>
                      <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Debited</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 7. CABLE TV */}
                {isCable && (
                  <>
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Cable Operator</span>
                      <div className="flex items-center gap-1.5">
                        {logoUrl && (
                          <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-100 bg-white shrink-0">
                            <Image src={logoUrl} alt="Cable Logo" fill className="object-contain p-0.5" />
                          </div>
                        )}
                        <span className="text-black font-extrabold uppercase">{transaction.billerName || "Cable Provider"}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Smartcard / UIC Number</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-black font-bold">
                          {transaction.smartcardNumber || transaction.customerId || "Not available"}
                        </span>
                        {(transaction.smartcardNumber || transaction.customerId) && (
                          <button
                            type="button"
                            onClick={() => handleCopy(transaction.smartcardNumber || transaction.customerId!, "Smartcard number")}
                            className="text-[#FC7A00]"
                          >
                            <span className="material-symbols-outlined text-[12px] font-bold">content_copy</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {transaction.packageName && (
                      <div className="flex justify-between items-start text-gray-500 font-semibold">
                        <span>Package Plan</span>
                        <span className="text-black font-bold text-right">{transaction.packageName}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Subscription Fee</span>
                      <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between items-center border-t border-gray-100 pt-2 text-gray-500 font-semibold">
                      <span>Total Debited</span>
                      <span className="text-black font-bold text-sm">{currencySymbol}{totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {/* 8. CURRENCY SWAP */}
                {isSwap && (
                  <>
                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Source Exchange</span>
                      <span className="text-black font-bold">{transaction.sourceCurrency || "NGN"} {transaction.sourceAmount?.toLocaleString() || transaction.amount.toLocaleString()}</span>
                    </div>

                    {transaction.exchangeRate && (
                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Applied Rate</span>
                        <span className="text-black font-bold font-mono">1 {transaction.sourceCurrency} = {transaction.exchangeRate} {transaction.destinationCurrency}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Destination Yield</span>
                      <span className="text-emerald-600 font-extrabold">{transaction.destinationCurrency || "USD"} {transaction.destinationAmount?.toLocaleString() || "Not available"}</span>
                    </div>

                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Swap Processing Fee</span>
                      <span className="text-black font-bold">{currencySymbol}{fee.toLocaleString()}</span>
                    </div>
                  </>
                )}

                {/* 9. REVERSAL / REFUND */}
                {isRefund && (() => {
                  const totalRefundedAmount = Number(transaction.totalCredited) || Number(transaction.totalDebited) || (transaction.amount + fee + vat);
                  let refundFee = fee;
                  let refundPrincipal = transaction.amount;

                  if (fee > 0 && transaction.amount >= totalRefundedAmount && totalRefundedAmount > fee) {
                    refundPrincipal = totalRefundedAmount - fee - vat;
                  } else if (fee === 0 && totalRefundedAmount > transaction.amount) {
                    refundFee = totalRefundedAmount - transaction.amount - vat;
                  }

                  const rawTarget = transaction.beneficiaryName || transaction.recipientName;
                  const isCardRef = isCardRefund || (rawTarget && rawTarget.toLowerCase().includes("virtual card"));
                  const targetName = isCardRef
                    ? "VIRTUAL CARD ISSUING"
                    : isBillRefund
                    ? (detectedNetworkName || transaction.billerName || "VTU SERVICE")
                    : rawTarget;
                  const isBankTransferRefund = !isCardRef && !isBillRefund && (transaction.beneficiaryBankName || transaction.recipientBankName || (resolvedTransferToBank && resolvedTransferToBank !== "Bank"));

                  const targetPhoneOrId = resolvedMobileNumber || transaction.phoneNumber || transaction.meterNumber || transaction.smartcardNumber || transaction.customerId;

                  return (
                    <>
                      {targetName && (
                        <div className="flex justify-between items-start text-gray-500 font-semibold">
                          <span>{isCardRef ? "Reversal Target" : isBillRefund ? (isAirtimeRefund || isDataRefund ? "Network Operator" : "Biller Provider") : "Reversal Target"}</span>
                          <div className="flex flex-col items-end text-right max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              {isBillRefund && logoUrl && (
                                <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-100 bg-white shrink-0">
                                  <Image src={logoUrl} alt="Operator Logo" fill className="object-contain p-0.5" />
                                </div>
                              )}
                              <span className="text-black font-extrabold uppercase">
                                {targetName}
                              </span>
                            </div>
                            {isBankTransferRefund && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <BankLogoResolver
                                  bankName={resolvedTransferToBank}
                                  bankCode={transaction.beneficiaryBankCode || transaction.recipientBankCode || transaction.bankCode}
                                  className="w-5 h-5 shrink-0"
                                />
                                <span className="text-black font-extrabold text-xs tracking-tight">
                                  {resolvedTransferToBank}
                                </span>
                              </div>
                            )}
                            {isBankTransferRefund && (transaction.beneficiaryAccountNumber || transaction.recipientAccountNumber) && (
                              <span className="font-mono text-gray-600 font-bold text-[11px] mt-0.5">
                                Account: {transaction.beneficiaryAccountNumber || transaction.recipientAccountNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {isBillRefund && targetPhoneOrId && (
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>
                            {isAirtimeRefund || isDataRefund
                              ? "Mobile Number"
                              : isElectricityRefund
                              ? "Meter Number"
                              : isCableRefund
                              ? "Smartcard / IUC"
                              : "Customer ID"}
                          </span>
                          <span className="font-mono text-black font-bold">{targetPhoneOrId}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Principal Amount</span>
                        <span className="text-black font-bold">{currencySymbol}{refundPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>{isBillRefund ? "Service Fee Refunded" : "Transfer Fee Refunded"}</span>
                        <span className="text-black font-bold">{currencySymbol}{refundFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>

                      {vat > 0 && (
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>VAT Refunded</span>
                          <span className="text-black font-bold">{currencySymbol}{vat.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Credited to</span>
                        <span className="text-black font-bold">Available Balance</span>
                      </div>

                      <div className="flex justify-between items-center text-gray-500 font-semibold border-t border-gray-100 pt-2">
                        <span>Total Credited / Refunded</span>
                        <span className="text-emerald-600 font-extrabold text-sm">{currencySymbol}{totalRefundedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  );
                })()}

                {/* 10. WALLET FUNDING (CARD / USSD / BANK TRANSFER) */}
                {isDeposit && (() => {
                  const rawFm = (transaction.fundingMethod || "").toUpperCase();
                  const isCardMethod = rawFm === "CARD" || desc.includes("card payment");
                  const isUssdMethod = rawFm === "USSD" || desc.includes("ussd");

                  const feeAmt = Number(transaction.fee) || 0;

                  const maskVirt = (vAcc?: string) => {
                    if (!vAcc) return null;
                    const clean = vAcc.replace(/\D/g, "");
                    if (clean.length <= 2) return clean;
                    return "********" + clean.slice(-2);
                  };

                  const isSuccessFunding = ledgerStatus.code === "CREDITED" || (transaction.status || "").toUpperCase() === "SUCCESS" || (transaction.status || "").toUpperCase() === "SUCCESSFUL";
                  const totalCreditedAmt = isSuccessFunding ? (Number(transaction.totalCredited) || transaction.amount) : 0;
                  const reasonMsg = (transaction as any).reason || (transaction as any).message ||
                    (!isSuccessFunding
                      ? (ledgerStatus.label === "Canceled" ? "Payment canceled by user" : ledgerStatus.label === "Expired" ? "Funding expired" : ledgerStatus.label === "Pending" ? "Waiting for payment confirmation" : "Payment declined or failed")
                      : null);

                  if (isCardMethod) {
                    const cardDisplay = (transaction as any).maskedCardNumber ||
                      ((transaction as any).cardBrand && (transaction as any).cardLast4
                        ? `${(transaction as any).cardBrand} •••• ${(transaction as any).cardLast4}`
                        : null);

                    return (
                      <>
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Funding Method</span>
                          <span className="text-black font-bold">Card Payment</span>
                        </div>

                        {cardDisplay && (
                          <div className="flex justify-between items-center text-gray-500 font-semibold">
                            <span>Card</span>
                            <span className="font-mono text-black font-bold">{cardDisplay}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>{isSuccessFunding ? "Amount" : "Attempted Amount"}</span>
                          <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Fee</span>
                          <span className="text-black font-bold">{currencySymbol}{feeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="flex justify-between items-center text-gray-500 font-semibold border-t border-gray-100 pt-2">
                          <span>{isSuccessFunding ? "Total Credited" : "Amount Credited"}</span>
                          <span className={cn("font-extrabold", isSuccessFunding ? "text-emerald-600" : "text-gray-500")}>
                            {currencySymbol}{totalCreditedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {reasonMsg && (
                          <div className="flex justify-between items-start text-gray-500 font-semibold">
                            <span>Reason</span>
                            <span className="text-rose-600 font-bold text-right max-w-[200px]">{reasonMsg}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Credited To</span>
                          <span className="text-black font-bold">Available Balance</span>
                        </div>
                      </>
                    );
                  }

                  if (isUssdMethod) {
                    const ussdBank = (transaction as any).ussdBankName || (resolvedTransferFromBank !== "Bank" ? resolvedTransferFromBank : null);

                    return (
                      <>
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Funding Method</span>
                          <span className="text-black font-bold">USSD</span>
                        </div>

                        {ussdBank && (
                          <div className="flex justify-between items-center text-gray-500 font-semibold">
                            <span>Bank</span>
                            <div className="flex items-center gap-1.5">
                              <BankLogoResolver bankName={ussdBank} className="w-5 h-5 shrink-0" />
                              <span className="text-black font-bold">{ussdBank}</span>
                            </div>
                          </div>
                        )}

                        {transaction.providerReference && (
                          <div className="flex justify-between items-center text-gray-500 font-semibold">
                            <span>USSD Reference</span>
                            <span className="font-mono text-black font-bold text-[11px] select-all">{transaction.providerReference}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>{isSuccessFunding ? "Amount" : "Attempted Amount"}</span>
                          <span className="text-black font-bold">{currencySymbol}{transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Fee</span>
                          <span className="text-black font-bold">{currencySymbol}{feeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="flex justify-between items-center text-gray-500 font-semibold border-t border-gray-100 pt-2">
                          <span>{isSuccessFunding ? "Total Credited" : "Amount Credited"}</span>
                          <span className={cn("font-extrabold", isSuccessFunding ? "text-emerald-600" : "text-gray-500")}>
                            {currencySymbol}{totalCreditedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {reasonMsg && (
                          <div className="flex justify-between items-start text-gray-500 font-semibold">
                            <span>Reason</span>
                            <span className="text-rose-600 font-bold text-right max-w-[200px]">{reasonMsg}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Credited To</span>
                          <span className="text-black font-bold">Available Balance</span>
                        </div>
                      </>
                    );
                  }

                  // Default: Dynamic Virtual Account / Bank Transfer
                  const displaySenderAccount = transaction.senderAccountNumber ? String(transaction.senderAccountNumber).trim() : null;
                  const maskedVirtualAccount = maskVirt(transaction.virtualAccountNumber);

                  const meta = (transaction.metadata || {}) as Record<string, any>;
                  const autoInflowFee = Number(meta.autoInflowFee) || (feeAmt > 0 ? feeAmt : 0);
                  const autoInflowNarration = meta.autoInflowNarration || "Stamp Duty Charge";
                  const grossAmt = Number(meta.grossAmount) || Number(meta.heldAmount) || transaction.amount;

                  return (
                    <>
                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Funding Method</span>
                        <span className="text-black font-bold">Bank Transfer</span>
                      </div>

                      {displaySenderName && (
                        <div className="flex justify-between items-start text-gray-500 font-semibold">
                          <span>From</span>
                          <span className="text-black font-bold uppercase text-right pl-3 break-words max-w-[220px]">{displaySenderName}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Sender Bank</span>
                        <div className="flex items-center gap-1.5">
                          <BankLogoResolver
                            bankName={resolvedSenderBank}
                            bankCode={transaction.senderBankCode}
                            className="w-5 h-5 shrink-0"
                          />
                          <span className="text-black font-bold">{resolvedSenderBank !== "Bank" ? resolvedSenderBank : "Bank information unavailable"}</span>
                        </div>
                      </div>

                      {displaySenderAccount && (
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Sender Account</span>
                          <span className="font-mono text-black font-bold">{displaySenderAccount}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>Receiving Bank</span>
                        <div className="flex items-center gap-1.5">
                          <BankLogoResolver
                            bankName={displayReceivingBank}
                            bankCode={transaction.recipientBankCode || transaction.beneficiaryBankCode}
                            className="w-5 h-5 shrink-0"
                          />
                          <span className="text-black font-bold">{displayReceivingBank}</span>
                        </div>
                      </div>

                      {transaction.virtualAccountNumber && (
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Virtual Account</span>
                          <span className="font-mono text-black font-bold">{maskedVirtualAccount || transaction.virtualAccountNumber}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>{isHeldDeposit ? "Gross Deposit Received" : isSuccessFunding ? "Gross Deposit" : "Attempted Amount"}</span>
                        <span className="text-black font-bold">{currencySymbol}{grossAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>

                      {autoInflowFee > 0 && (
                        <div className="flex justify-between items-center text-[#E06600] font-bold">
                          <span>{autoInflowNarration}</span>
                          <span className="font-mono">- {currencySymbol}{autoInflowFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}

                      {feeAmt > 0 && autoInflowFee === 0 && (
                        <div className="flex justify-between items-center text-gray-500 font-semibold">
                          <span>Processing Fee</span>
                          <span className="text-black font-bold">{currencySymbol}{feeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold border-t border-gray-100 pt-2">
                        <span>{isHeldDeposit ? "Net Held Amount" : isSuccessFunding ? "Net Credited Balance" : "Amount Credited"}</span>
                        <span className={cn("font-extrabold", isHeldDeposit ? "text-amber-700 font-mono text-sm" : isSuccessFunding ? "text-emerald-600 text-sm" : "text-gray-500")}>
                          {currencySymbol}{(isHeldDeposit ? (grossAmt - autoInflowFee) : totalCreditedAmt).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {reasonMsg && (
                        <div className="flex justify-between items-start text-gray-500 font-semibold">
                          <span>Reason</span>
                          <span className="text-rose-600 font-bold text-right max-w-[200px]">{reasonMsg}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 font-semibold">
                        <span>{isHeldDeposit ? "Held Status" : "Credited To"}</span>
                        <span className="text-black font-bold">{isHeldDeposit ? "Pending Tier Limit Release" : "Available Balance"}</span>
                      </div>
                    </>
                  );
                })()}

                {/* UNIFIED METADATA */}
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <div className="flex justify-between items-center text-gray-500 font-semibold">
                    <span>Transaction Status</span>
                    <span className={cn("font-bold text-xs uppercase px-2 py-0.5 rounded-md border", ledgerStatus.badgeBg, ledgerStatus.badgeText, ledgerStatus.badgeBorder)}>
                      {ledgerStatus.label}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-gray-500 font-semibold">
                    <span>Transaction Number</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-black font-bold uppercase text-[11px]">
                        {transaction.reference}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(transaction.reference, "Transaction number")}
                        className="text-[#FC7A00] hover:brightness-90 active:scale-90"
                      >
                        <span className="material-symbols-outlined text-[13px] font-bold">content_copy</span>
                      </button>
                    </div>
                  </div>

                  {transaction.providerReference && (
                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>Provider Reference</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-black font-bold uppercase text-[11px] truncate max-w-[140px]">
                          {transaction.providerReference}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(transaction.providerReference!, "Provider reference")}
                          className="text-[#FC7A00] hover:brightness-90 active:scale-90"
                        >
                          <span className="material-symbols-outlined text-[13px] font-bold">content_copy</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {transaction.sessionId && (
                    <div className="flex justify-between items-center text-gray-500 font-semibold">
                      <span>NIBSS Session ID</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-black font-bold uppercase text-[11px] truncate max-w-[140px]">
                          {transaction.sessionId}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(transaction.sessionId!, "Session ID")}
                          className="text-[#FC7A00] hover:brightness-90 active:scale-90"
                        >
                          <span className="material-symbols-outlined text-[13px] font-bold">content_copy</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-gray-500 font-semibold">
                    <span>Transaction Date</span>
                    <span className="text-black font-bold text-right">
                      {formattedDateTime}
                    </span>
                  </div>

                  {displayNarration && (
                    <div className="flex justify-between items-start text-gray-500 font-semibold">
                      <span>Narration</span>
                      <span className="text-black font-bold text-right pl-3 break-words max-w-[220px]">{displayNarration}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-gray-500 font-semibold">
                    <span>Provider Channel</span>
                    <span className="text-black font-bold">{transaction.provider || "E-Tech Gateway"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-5 border-t border-gray-100 flex flex-col items-center justify-center space-y-1">
              <div className="relative w-20 h-5 opacity-40">
                <Image
                  src={receiptHeaderLogo}
                  alt="Receipt Signature"
                  fill
                  className="object-contain"
                />
              </div>
              <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest text-center">
                {receiptHeaderName} SECURE LEDGER
              </p>
            </div>
          </div>
        </div>

        {/* Single Bottom Action Button: Share Receipt */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-lg z-10">
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#E06600] text-white font-bold text-sm uppercase tracking-wider rounded-2xl cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-xl font-bold">share</span>
            Share Receipt
          </button>
        </div>

        {/* Dedicated Standalone "Share Receipt" Modal */}
        <ShareReceiptModal
          isOpen={showShareModal}
          transaction={transaction}
          currencySymbol={currencySymbol}
          displayAmount={displayAmount}
          statusText={ledgerStatus.label === "Credited" || ledgerStatus.label === "Debited" ? "Successful" : ledgerStatus.label}
          formattedDateTime={formattedDateTime}
          recipientNameDisplay={recipientNameDisplay}
          recipientBankAndAcc={recipientBankAndAcc}
          senderNameDisplay={senderNameDisplay}
          senderBankAndAcc={senderBankAndAcc}
          txTypeDisplay={txTypeDisplay}
          displayNarration={displayNarration || ""}
          onClose={() => setShowShareModal(false)}
        />

        {/* Report Transaction PIN / Biometric Modal */}
        <InvestmentPinModal
          isOpen={isReportPinModalOpen}
          onClose={() => setIsReportPinModalOpen(false)}
          title="Authorize Report Submission"
          description="Enter your 4-digit PIN to authorize submitting this transaction report."
          isSubmitting={isSubmittingReport}
          onPinSubmit={(pin, isBiometric) => handleExecuteReportSubmission(pin, isBiometric)}
        />

        {/* Dedicated Report Transaction Issue Modal */}
        <ReportTransactionIssueModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          transaction={transaction}
          onAuthorizeAndSubmit={handleAuthorizeReportRequest}
          isSubmitting={isSubmittingReport}
        />
      </motion.div>
    </AnimatePresence>
  );
};
