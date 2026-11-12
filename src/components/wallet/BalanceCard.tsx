"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { KycVerificationDrawer } from "@/components/profile/KycVerificationDrawer";
import { TierUpgradeDrawerModal } from "@/components/profile/TransferLimitsSection";
import { AuthorizeTransactionModal } from "@/components/wallet/AuthorizeTransactionModal";
import BannerSlideshow from "@/components/BannerSlideshow";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { AppLogo } from "@/components/AppLogo";
import { FeatureDisabledBanner } from "@/components/FeatureDisabledBanner";
import { isFeatureEnabled, getFeatureDisabledMessage } from "@/lib/feature-toggle";
import { triggerHaptic } from "@/lib/haptics";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { getBiometricLabel, getBiometricType, authenticateBiometricDetailed } from "@/lib/biometrics-util";
import { TransactionReceipt, Transaction } from "@/components/wallet/TransactionReceipt";
import { cn } from "@/lib/utils";

interface BalanceCardProps {
  balance: number;
  currency: string;
  userName?: string;
  isLoading?: boolean;
}

interface BankLogoProps {
  name: string;
  code?: string;
  logoUrl?: string | null;
  logoBackupUrl?: string | null;
}

const BankLogo: React.FC<BankLogoProps> = ({ name, code, logoUrl, logoBackupUrl }) => {
  const [attemptIndex, setAttemptIndex] = useState(0);

  const initials = name.substring(0, 2).toUpperCase();
  const colors = [
    "bg-orange-100 text-orange-700 border-orange-200",
    "bg-emerald-100 text-emerald-700 border-emerald-200",
    "bg-blue-100 text-blue-700 border-blue-200",
    "bg-purple-100 text-purple-700 border-purple-200",
    "bg-rose-100 text-rose-700 border-rose-200",
    "bg-amber-100 text-amber-700 border-amber-200",
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  const logoColorClass = colors[sum % colors.length];

  const trimmed = String(code || "").trim();
  const paddedCode = trimmed && /^\d+$/.test(trimmed) ? trimmed.padStart(3, "0") : trimmed;
  const staticPath = paddedCode ? `/bank-logos/${paddedCode}.png` : null;

  const candidateUrls: string[] = [];
  if (logoUrl) candidateUrls.push(logoUrl);
  if (logoBackupUrl && logoBackupUrl !== logoUrl) candidateUrls.push(logoBackupUrl);
  if (staticPath && !candidateUrls.includes(staticPath)) candidateUrls.push(staticPath);

  const activeUrl = candidateUrls[attemptIndex];

  if (activeUrl) {
    return (
      <div className="w-11 h-11 rounded-full border border-gray-100 flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
        <img
          src={activeUrl}
          alt={`${name} logo`}
          className="w-full h-full object-contain p-1.5"
          loading="lazy"
          onError={() => setAttemptIndex((prev) => prev + 1)}
        />
      </div>
    );
  }

  return (
    <div className={`w-11 h-11 rounded-full border flex items-center justify-center text-xs font-black tracking-tighter flex-shrink-0 ${logoColorClass}`}>
      {initials}
    </div>
  );
};


export const BalanceCard: React.FC<BalanceCardProps> = ({ balance, currency, userName, isLoading }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { userData, user, updateUserData } = useAuth();
  const [isTierUpgradeOpen, setIsTierUpgradeOpen] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("balance_visible");
    if (saved !== null) {
      setIsVisible(saved === "true");
    }
  }, []);

  const toggleVisibility = () => {
    // Give the eye/balance visibility control the same immediate native-style
    // haptic feedback as the bottom navigation.
    triggerHaptic();
    const nextState = !isVisible;
    setIsVisible(nextState);
    sessionStorage.setItem("balance_visible", String(nextState));
    window.dispatchEvent(new Event("balance_visibility_changed"));
  };
  const { config } = useAppConfig();
  const router = useRouter();
  const [totalInvestment, setTotalInvestment] = useState<number>(0);
  const [isKycDrawerOpen, setIsKycDrawerOpen] = useState(false);

  // Multi-currency States
  const [selectedCurrency, setSelectedCurrency] = useState<string>("NGN");
  const [currencyVisibility, setCurrencyVisibility] = useState<Record<string, boolean>>({});
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({ NGN: balance, USD: 0, XOF: 0 });
  const [usdAccountData, setUsdAccountData] = useState<{
    accountNumber: string;
    bankName: string;
    routingNumber: string;
    swiftCode?: string;
  } | null>(null);

  const [isUsdFundingOpen, setIsUsdFundingOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);

  // Swap states
  const [swapStep, setSwapStep] = useState<"form" | "pin">("form");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapFromCurrency, setSwapFromCurrency] = useState<string>("NGN");
  const [swapToCurrency, setSwapToCurrency] = useState<string>("USD");
  const [swapRate, setSwapRate] = useState<number | null>(null);
  const [swapFee, setSwapFee] = useState<number>(0);
  const [swapTargetAmount, setSwapTargetAmount] = useState<number>(0);
  const [isRatesLoading, setIsRatesLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapPin, setSwapPin] = useState("");

  useEffect(() => {
    setWalletBalances(prev => ({ ...prev, NGN: balance }));
  }, [balance]);

  useEffect(() => {
    if (isSwapOpen) {
      setSwapFromCurrency(selectedCurrency);
      setSwapToCurrency(selectedCurrency === "USD" ? "NGN" : (selectedCurrency === "XOF" ? "NGN" : "USD"));
      setSwapAmount("");
      setSwapStep("form");
      setSwapPin("");
    }
  }, [selectedCurrency, isSwapOpen]);

  const fetchWalletBalances = async () => {
    if (!user) return;
    try {
      let idToken = "mock-token";
      const isMock = sessionStorage.getItem("mock") === "true";
      if (!isMock) {
        idToken = await user.getIdToken();
      } else {
        // Mock data
        setWalletBalances({ NGN: balance, USD: 1250, XOF: 750000 });
        setUsdAccountData({
          accountNumber: "2209418374",
          bankName: "Silicon Valley Bank",
          routingNumber: "021000021",
          swiftCode: "SVBKNM2E"
        });
        return;
      }

      const res = await fetch("/api/wallets", {
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.wallets) {
          const ngnBal = data.wallets.NGN?.balance ?? balance;
          const usdBal = data.wallets.USD?.balance ?? 0;
          const xofBal = data.wallets.XOF?.balance ?? 0;
          setWalletBalances((prev) => ({ ...prev, NGN: ngnBal, USD: usdBal, XOF: xofBal }));
        }
      }

      // Fetch public rates to obtain currencyVisibility map
      const ratesRes = await fetch("/api/exchange-rates");
      if (ratesRes.ok) {
        const ratesData = await ratesRes.json();
        if (ratesData.success && ratesData.currencyVisibility) {
          setCurrencyVisibility(ratesData.currencyVisibility);
        }
      }

      const accRes = await fetch("/api/wallets/accounts", {
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });
      if (accRes.ok) {
        const accData = await accRes.json();
        if (accData.success && accData.accounts?.USD) {
          setUsdAccountData(accData.accounts.USD);
        }
      }
    } catch (err) {
      console.error("Error fetching multi-currency wallet state:", err);
    }
  };

  useEffect(() => {
    if (balance !== undefined && !isNaN(balance)) {
      setWalletBalances((prev) => ({ ...prev, NGN: balance }));
    }
  }, [balance]);

  useEffect(() => {
    fetchWalletBalances();
    // Fetch occasionally
    const intv = setInterval(fetchWalletBalances, 10000);
    return () => clearInterval(intv);
  }, [user, balance]);

  useEffect(() => {
    const handleRefresh = () => {
      console.log("[app-refresh] Custom event received! Dynamic reload triggered.");
      fetchWalletBalances();
      fetchInvestmentBalance();
    };
    window.addEventListener("app-refresh", handleRefresh);
    return () => {
      window.removeEventListener("app-refresh", handleRefresh);
    };
  }, [user, balance]);

  useEffect(() => {
    if (!isSwapOpen) {
      setSwapAmount("");
      setSwapRate(null);
      setSwapFee(0);
      setSwapTargetAmount(0);
      return;
    }

    const inputAmt = parseFloat(swapAmount);
    const amtToQuery = !isNaN(inputAmt) && inputAmt > 0 ? inputAmt : 1;

    const fetchRate = async () => {
      setIsRatesLoading(true);
      try {
        const fromCurrency = swapFromCurrency;
        const toCurrency = swapToCurrency;

        let idToken = "";
        if (user) {
          try {
            idToken = await user.getIdToken();
          } catch {}
        }

        const headers: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
        const res = await fetch(`/api/wallets/rates?from=${fromCurrency}&to=${toCurrency}&amount=${amtToQuery}`, { headers });
        const data = await res.json();
        if (res.ok && data.success) {
          setSwapRate(data.rate);
          setSwapFee(!isNaN(inputAmt) && inputAmt > 0 ? (data.fee || 0) : 0);
          setSwapTargetAmount(!isNaN(inputAmt) && inputAmt > 0 ? data.targetAmount : 0);
        } else {
          console.warn("Could not fetch realtime exchange rates:", data?.error);
          setSwapRate(null);
          setSwapFee(0);
          setSwapTargetAmount(0);
        }
      } catch (err) {
        console.error("Error fetching swap rate:", err);
      } finally {
        setIsRatesLoading(false);
      }
    };

    const delay = setTimeout(fetchRate, 300);
    return () => clearTimeout(delay);
  }, [swapAmount, isSwapOpen, swapFromCurrency, swapToCurrency, user]);

  const handleSwapFormContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(swapAmount);
    const available = swapFromCurrency === "NGN" ? walletBalances.NGN : (swapFromCurrency === "USD" ? walletBalances.USD : walletBalances.XOF);

    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid swap amount.");
      return;
    }

    if (amt > available) {
      toast.error(`Insufficient balance in your ${swapFromCurrency} wallet.`);
      return;
    }

    if (swapRate === null || swapTargetAmount <= 0) {
      toast.error("Exchange rate temporarily unavailable. Please try again.");
      return;
    }

    setSwapStep("pin");
  };

  const handleSwapExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isFeatureEnabled(config?.featureToggles, "currency_swap")) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, "currency_swap"));
      return;
    }
    const amt = parseFloat(swapAmount);
    const fromCurrency = swapFromCurrency;
    const toCurrency = swapToCurrency;
    const available = fromCurrency === "NGN" ? walletBalances.NGN : (fromCurrency === "USD" ? walletBalances.USD : walletBalances.XOF);

    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid swap amount.");
      return;
    }

    if (amt > available) {
      toast.error(`Insufficient balance in your ${fromCurrency} wallet.`);
      return;
    }

    if (!swapPin || swapPin.length < 4) {
      toast.error("Please enter your 4-digit transaction PIN.");
      return;
    }

    setIsSwapping(true);
    toast.loading("Authorizing currency exchange...");

    try {
      if (sessionStorage.getItem("mock") === "true") {
        if (swapPin !== "1234") {
          toast.dismiss();
          toast.error("Incorrect transaction PIN. Mock PIN is 1234.");
          setSwapPin("");
          setIsSwapping(false);
          return;
        }

        setTimeout(() => {
          toast.dismiss();
          const targetAmt = swapTargetAmount > 0 ? swapTargetAmount : amt * (swapRate || 1);

          setWalletBalances(prev => {
            const next = { ...prev };
            next[fromCurrency] -= amt;
            next[toCurrency] += targetAmt;
            return next;
          });

          toast.success("Currency swapped successfully!");
          setIsSwapping(false);
          setIsSwapOpen(false);
        }, 1000);
        return;
      }

      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/wallets/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fromCurrency,
          toCurrency,
          amount: amt,
          pin: swapPin
        })
      });

      const data = await res.json();
      toast.dismiss();

      if (res.ok && data.success) {
        toast.success(data.message || "Currency swapped successfully!");
        fetchWalletBalances();
        setIsSwapOpen(false);
      } else {
        toast.error(data.error || data.message || "Failed to execute swap.");
        setSwapPin("");
      }
    } catch (err) {
      console.error("Swap Error:", err);
      toast.dismiss();
      toast.error("Network communication error during swap.");
      setSwapPin("");
    } finally {
      setIsSwapping(false);
    }
  };

  // Add Money Wizard States
  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<"amount" | "methods" | "ussd-bank" | "ussd-pay" | "transfer-pay" | "success">("amount");
  const [addAmount, setAddAmount] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isMethodsLoading, setIsMethodsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Dynamic Bank Discovery States
  const [banksList, setBanksList] = useState<Array<{ id: string; name: string; code?: string; logoUrl?: string | null }>>([]);
  const [isBanksLoading, setIsBanksLoading] = useState(false);
  const [selectedBank, setSelectedBank] = useState<{ id: string; name: string; code?: string } | null>(null);
  const [ussdErrorMessage, setUssdErrorMessage] = useState("");

  // Permanent Virtual Account States
  const [permanentAccount, setPermanentAccount] = useState<{
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null>(null);
  const [isPermAccountLoading, setIsPermAccountLoading] = useState(false);

  const showPendingCard = !isPermAccountLoading && !permanentAccount;
  const showSuccessCard = !isPermAccountLoading && !!permanentAccount;

  // Outward Transfer Wizard States & Fast Deferred Loading
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isTrfContentReady, setIsTrfContentReady] = useState(false);
  const [trfStep, setTrfStep] = useState<"input" | "amount" | "confirm" | "pin" | "completion">("input");

  useEffect(() => {
    if (isTransferOpen) {
      const raf = requestAnimationFrame(() => {
        setIsTrfContentReady(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsTrfContentReady(false);
    }
  }, [isTransferOpen]);
  const [trfKeypadNumbers, setTrfKeypadNumbers] = useState<string[]>([]);

  const shuffleTrfKeypad = () => {
    const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    setTrfKeypadNumbers(numbers);
  };

  // Single Transfer states
  const [trfBank, setTrfBank] = useState<{ id: string; name: string; code?: string; logoUrl?: string | null } | null>(null);
  const [trfAccount, setTrfAccount] = useState("");
  const [trfAccountName, setTrfAccountName] = useState("");
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const [trfAmount, setTrfAmount] = useState("");
  const [trfNarration, setTrfNarration] = useState("");
  const [trfFee, setTrfFee] = useState(0);
  const [trfTotalDebit, setTrfTotalDebit] = useState(0);
  const [trfFeeData, setTrfFeeData] = useState<{ remainingFreeTransfers?: number; showFreeIndicator?: boolean } | null>(null);
  const [isFeeLoading, setIsFeeLoading] = useState(false);

  // Smart Auto-Detection states (without breaking existing transfer flow)
  const [isManualFallback, setIsManualFallback] = useState(true);

  // Bulk Transfer States
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkRecipients, setBulkRecipients] = useState<Array<{
    accountNumber: string;
    bankId: string;
    bankCode?: string;
    bankName: string;
    recipientName: string;
    amount: number;
    logoUrl?: string | null;
    logoBackupUrl?: string | null;
  }>>([]);

  // Bulk inputs state
  const [bulkBank, setBulkBank] = useState<{ id: string; name: string; code?: string; logoUrl?: string | null; logoBackupUrl?: string | null } | null>(null);
  const [bulkAccount, setBulkAccount] = useState("");
  const [bulkName, setBulkName] = useState("");
  const [bulkAmountVal, setBulkAmountVal] = useState("");
  const [isBulkResolving, setIsBulkResolving] = useState(false);

  // PIN states
  const [trfPin, setTrfPin] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<{ success: boolean; message: string; reference?: string } | null>(null);
  const [completedTxForReceipt, setCompletedTxForReceipt] = useState<Transaction | null>(null);
  const [openWithShareModal, setOpenWithShareModal] = useState(false);
  const [isBeneficiarySaved, setIsBeneficiarySaved] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [showTrfBankSelector, setShowTrfBankSelector] = useState(false);

  const handleOpenBankSelector = () => {
    setBankSearchQuery("");
    setShowTrfBankSelector(true);
  };

  // Recents & Beneficiaries States
  interface SavedRecipientItem {
    id?: string;
    userId: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    accountName: string;
    createdAt: string;
  }

  const [recents, setRecents] = useState<SavedRecipientItem[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<SavedRecipientItem[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(false);
  const [recentsLimit, setRecentsLimit] = useState(5);
  const [beneficiariesLimit, setBeneficiariesLimit] = useState(5);
  const [listTab, setListTab] = useState<"recents" | "beneficiaries">("recents");
  const [showSaveBeneficiaryPrompt, setShowSaveBeneficiaryPrompt] = useState(false);

  // Intercept hardware / mobile back button & lock body scroll across drawers with stacked back history
  useModalBackHandler(isAddMoneyOpen, () => handleCloseModal(), "add-money-modal");
  useModalBackHandler(isAddMoneyOpen && wizardStep !== "amount" && wizardStep !== "success", () => {
    if (wizardStep === "methods") setWizardStep("amount");
    else if (wizardStep === "ussd-bank") setWizardStep("methods");
    else if (wizardStep === "ussd-pay") setWizardStep("ussd-bank");
    else if (wizardStep === "transfer-pay") setWizardStep("methods");
  }, "add-money-substep");

  const [isTrfPinModalOpen, setIsTrfPinModalOpen] = useState(false);

  useModalBackHandler(isTransferOpen, () => handleCloseTransferModal(), "transfer-modal");
  useModalBackHandler(isTransferOpen && trfStep === "pin", () => setTrfStep("confirm"), "transfer-step-pin");
  useModalBackHandler(isTransferOpen && trfStep === "confirm", () => setTrfStep("input"), "transfer-step-confirm");
  useModalBackHandler(isTransferOpen && showTrfBankSelector, () => setShowTrfBankSelector(false), "bank-selector-modal");
  useModalBackHandler(isTransferOpen && showSaveBeneficiaryPrompt, () => setShowSaveBeneficiaryPrompt(false), "save-beneficiary-prompt");

  useModalBackHandler(isSwapOpen, () => setIsSwapOpen(false), "swap-modal");
  useModalBackHandler(isSwapOpen && swapStep === "pin", () => setSwapStep("form"), "swap-step-pin");
  useModalBackHandler(isUsdFundingOpen, () => setIsUsdFundingOpen(false), "usd-funding-modal");

  const loadRecentsAndBeneficiaries = async () => {
    if (!user) {
      setRecentsLoading(false);
      return;
    }
    setRecentsLoading(true);
    try {
      // Fetch Recents with resilient fallback
      const recentsList: SavedRecipientItem[] = [];
      try {
        const recentsQuery = query(
          collection(db, "recents"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const recentsSnap = await getDocs(recentsQuery);
        recentsSnap.forEach((doc) => {
          recentsList.push({ id: doc.id, ...doc.data() } as SavedRecipientItem);
        });
      } catch (rErr) {
        console.warn("[Recents Query Warning] Indexed query failed, trying unindexed fallback:", rErr);
        try {
          const fallbackQ = query(
            collection(db, "recents"),
            where("userId", "==", user.uid),
            limit(20)
          );
          const snap = await getDocs(fallbackQ);
          snap.forEach((doc) => {
            recentsList.push({ id: doc.id, ...doc.data() } as SavedRecipientItem);
          });
          recentsList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        } catch (fallbackErr) {
          console.error("[Recents Fallback Query Error]:", fallbackErr);
        }
      }
      setRecents(recentsList);

      // Fetch Beneficiaries with resilient fallback
      const benList: SavedRecipientItem[] = [];
      try {
        const benQuery = query(
          collection(db, "beneficiaries"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const benSnap = await getDocs(benQuery);
        benSnap.forEach((doc) => {
          benList.push({ id: doc.id, ...doc.data() } as SavedRecipientItem);
        });
      } catch (bErr) {
        console.warn("[Beneficiaries Query Warning] Indexed query failed, trying unindexed fallback:", bErr);
        try {
          const fallbackQ = query(
            collection(db, "beneficiaries"),
            where("userId", "==", user.uid),
            limit(20)
          );
          const snap = await getDocs(fallbackQ);
          snap.forEach((doc) => {
            benList.push({ id: doc.id, ...doc.data() } as SavedRecipientItem);
          });
          benList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        } catch (fallbackErr) {
          console.error("[Beneficiaries Fallback Query Error]:", fallbackErr);
        }
      }
      setBeneficiaries(benList);
    } catch (err) {
      console.error("Failed to load recents and beneficiaries:", err);
    } finally {
      setRecentsLoading(false);
    }
  };

  useEffect(() => {
    if (isTransferOpen && user) {
      const safetyTimer = setTimeout(() => {
        setRecentsLoading(false);
      }, 2500);
      loadRecentsAndBeneficiaries().finally(() => clearTimeout(safetyTimer));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransferOpen, user]);

  const handleSelectRecipient = (item: SavedRecipientItem) => {
    setTrfAccount(item.accountNumber);
    setTrfAccountName(item.accountName);
    setIsManualFallback(false);
    const matchedBank = banksList.find(b => b.code === item.bankCode || b.id === item.bankCode || b.name === item.bankName);
    if (matchedBank) {
      setTrfBank(matchedBank);
    } else {
      setTrfBank({ id: item.bankCode, name: item.bankName, code: item.bankCode });
    }
  };

  const handleSaveRecent = async () => {
    if (!user || isBulkMode) return;
    try {
      const docId = `rec-${user.uid}-${trfAccount}`;
      await setDoc(doc(db, "recents", docId), {
        userId: user.uid,
        accountNumber: trfAccount,
        bankCode: trfBank?.code || trfBank?.id || "",
        bankName: trfBank?.name || "",
        accountName: trfAccountName,
        createdAt: new Date().toISOString(),
      });
      const alreadyBen = beneficiaries.some(b => b.accountNumber === trfAccount);
      if (!alreadyBen) {
        setShowSaveBeneficiaryPrompt(true);
      } else {
        loadRecentsAndBeneficiaries();
      }
    } catch (err) {
      console.error("Failed to save recent recipient:", err);
    }
  };

  const handleSaveBeneficiary = async () => {
    if (!user) return;
    try {
      const docId = `ben-${user.uid}-${trfAccount}`;
      await setDoc(doc(db, "beneficiaries", docId), {
        userId: user.uid,
        accountNumber: trfAccount,
        bankCode: trfBank?.code || trfBank?.id || "",
        bankName: trfBank?.name || "",
        accountName: trfAccountName,
        createdAt: new Date().toISOString(),
      });
      toast.success("Recipient successfully added to saved Beneficiaries!");
      setShowSaveBeneficiaryPrompt(false);
      loadRecentsAndBeneficiaries();
    } catch (err) {
      console.error("Failed to save beneficiary:", err);
      toast.error("Failed to save beneficiary.");
    }
  };

  const handleSaveBulkRecents = async () => {
    if (!user || bulkRecipients.length === 0) return;
    try {
      for (const rec of bulkRecipients) {
        const docId = `rec-${user.uid}-${rec.accountNumber}`;
        await setDoc(doc(db, "recents", docId), {
          userId: user.uid,
          accountNumber: rec.accountNumber,
          bankCode: rec.bankId,
          bankName: rec.bankName,
          accountName: rec.recipientName,
          createdAt: new Date().toISOString(),
        });
      }
      setShowSaveBeneficiaryPrompt(true);
    } catch (err) {
      console.error("Failed to save bulk recents:", err);
    }
  };

  const handleSaveBulkBeneficiaries = async () => {
    if (!user || bulkRecipients.length === 0) return;
    try {
      for (const rec of bulkRecipients) {
        const docId = `ben-${user.uid}-${rec.accountNumber}`;
        await setDoc(doc(db, "beneficiaries", docId), {
          userId: user.uid,
          accountNumber: rec.accountNumber,
          bankCode: rec.bankId,
          bankName: rec.bankName,
          accountName: rec.recipientName,
          createdAt: new Date().toISOString(),
        });
      }
      toast.success("All batch recipients added to saved Beneficiaries!");
      setShowSaveBeneficiaryPrompt(false);
      loadRecentsAndBeneficiaries();
    } catch (err) {
      console.error("Failed to save bulk beneficiaries:", err);
      toast.error("Failed to save bulk beneficiaries.");
    }
  };

  // Active checkout data
  const [activeTxRef, setActiveTxRef] = useState("");
  const [ussdCode, setUssdCode] = useState("");
  const [transferDetails, setTransferDetails] = useState<{
    transferAccount: string;
    transferBank: string;
    transferAmount: number;
    transferReference: string;
    transferNote: string;
  } | null>(null);

  const [confirmedCreditedAmount, setConfirmedCreditedAmount] = useState<number | null>(null);

  // Timer & Polling Refs
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes default
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "PROCESSING" | "PAID" | "EXPIRED" | "FAILED">("PENDING");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollInFlightRef = useRef<boolean>(false);
  const isPollingActiveRef = useRef<boolean>(false);

  const resolvedName = (
    userName ||
    userData?.name ||
    user?.displayName ||
    "THE CAPTAIN"
  ).toUpperCase();

  // Resolve bulk recipient bank account details when 10 digits filled
  useEffect(() => {
    if (bulkAccount.length === 10 && bulkBank) {
      const resolveBulkAccount = async () => {
        setIsBulkResolving(true);
        setBulkName("");

        if (sessionStorage.getItem("mock") === "true") {
          setTimeout(() => {
            setBulkName("MOCK RECIPIENT USER");
            setIsBulkResolving(false);
            toast.success("Recipient account verified (MOCK)!");
          }, 300);
          return;
        }

        try {
          let idToken = "mock-token";
          if (user && sessionStorage.getItem("mock") !== "true") {
            idToken = await user.getIdToken();
          }

          const bodyPayload = {
            bankId: bulkBank.id,
            bankCode: bulkBank.code || bulkBank.id,
            account_bank: bulkBank.code || bulkBank.id,
            accountBank: bulkBank.code || bulkBank.id,
            accountNumber: bulkAccount,
            account_number: bulkAccount,
          };
          console.log("Resolve Account payload (Bulk):", bodyPayload);

          const res = await fetch("/api/flutterwave/resolve-account", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify(bodyPayload),
          });
          const data = await res.json();
          console.log("Resolve Account API raw response (Bulk):", data);

          const isSuccess = data.status === "success" || data.success === true;
          const resolvedName = data.accountName ||
                               data.account_name ||
                               data.data?.account_name ||
                               data.data?.accountName ||
                               "";

          if (res.ok && isSuccess && resolvedName) {
            setBulkName(resolvedName);
            toast.success("Recipient account verified!");
          } else {
            toast.error(data.error || data.message || "Could not resolve account details.");
          }
        } catch {
          toast.error("Failed to connect to verification server.");
        } finally {
          setIsBulkResolving(false);
        }
      };

      resolveBulkAccount();
    }
  }, [bulkAccount, bulkBank, user]);

  // Automatically resolve bank account details when 10 digits are inputted
  useEffect(() => {
    if (trfAccount.length === 10 && trfBank) {
      const resolveAccount = async () => {
        setIsResolvingAccount(true);
        setTrfAccountName("");

        // Add logs showing the selected bank name, its Flutterwave code, the account number, and the payload sent to the Payment Gateway.
        const bodyPayload = {
          bankId: trfBank.id,
          bankCode: trfBank.code || trfBank.id,
          account_bank: trfBank.code || trfBank.id,
          accountBank: trfBank.code || trfBank.id,
          accountNumber: trfAccount,
          account_number: trfAccount,
        };
        console.log("-----------------------------------------");
        console.log("AUTO-RESOLUTION INITIATED:");
        console.log("Selected Bank Name:", trfBank.name);
        console.log("Selected Bank Flutterwave Code:", trfBank.code || trfBank.id);
        console.log("Account Number:", trfAccount);
        console.log("Payload sent to Payment Gateway:", JSON.stringify(bodyPayload, null, 2));
        console.log("-----------------------------------------");

        if (sessionStorage.getItem("mock") === "true") {
          setTimeout(() => {
            setTrfAccountName("MOCK SINGLE RECIPIENT");
            setIsResolvingAccount(false);
            toast.success("Recipient account verified (MOCK)!");
          }, 300);
          return;
        }

        try {
          let idToken = "mock-token";
          if (user && sessionStorage.getItem("mock") !== "true") {
            idToken = await user.getIdToken();
          }

          const res = await fetch("/api/flutterwave/resolve-account", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify(bodyPayload),
          });
          const data = await res.json();
          console.log("Resolve Account API raw response (Single):", data);

          const isSuccess = data.status === "success" || data.success === true;
          const resolvedName = data.accountName ||
                               data.account_name ||
                               data.data?.account_name ||
                               data.data?.accountName ||
                               "";

          if (res.ok && isSuccess && resolvedName) {
            setTrfAccountName(resolvedName);
            toast.success("Recipient account verified!");
          } else {
            toast.error(data.error || data.message || "Could not resolve account details.");
          }
        } catch {
          toast.error("Failed to connect to verification server.");
        } finally {
          setIsResolvingAccount(false);
        }
      };

      resolveAccount();
    }
  }, [trfAccount, trfBank, user]);

  // Manual Recipient Account Resolution Handler (TASK 1)
  const resolveAccountManually = async () => {
    if (!trfBank) {
      toast.error("Please select a recipient bank.");
      return;
    }
    if (trfAccount.length !== 10) {
      toast.error("Account number must be exactly 10 digits.");
      return;
    }

    setIsResolvingAccount(true);
    setTrfAccountName("");

    if (sessionStorage.getItem("mock") === "true") {
      setTimeout(() => {
        setTrfAccountName("MOCK RECIPIENT USER");
        setIsResolvingAccount(false);
        toast.success("Recipient account verified (MOCK)!");
      }, 300);
      return;
    }

    try {
      let idToken = "mock-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      const bodyPayload = {
        bankId: trfBank.id,
        bankCode: trfBank.code || trfBank.id,
        account_bank: trfBank.code || trfBank.id,
        accountBank: trfBank.code || trfBank.id,
        accountNumber: trfAccount,
        account_number: trfAccount,
      };
      console.log("Resolve Account Payload (Manual):", bodyPayload);

      const res = await fetch("/api/flutterwave/resolve-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      console.log("Resolve Account Response (Manual):", data);

      const isSuccess = data.status === "success" || data.success === true;
      const resolvedName = data.accountName ||
                           data.account_name ||
                           data.data?.account_name ||
                           data.data?.accountName ||
                           "";

      if (res.ok && isSuccess && resolvedName) {
        setTrfAccountName(resolvedName);
        toast.success("Recipient account verified!");
      } else {
        const errorMsg = data.error || data.message || data.data?.message || "Could not resolve account details. Please verify your details.";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Failed to connect to verification server.");
    } finally {
      setIsResolvingAccount(false);
    }
  };


  // Automatically calculate transfer fee when transferAmount or bulkRecipients changes (Single & Bulk Mode)
  useEffect(() => {
    const amt = isBulkMode
      ? bulkRecipients.reduce((sum, curr) => sum + curr.amount, 0)
      : parseFloat(trfAmount);

    if (isNaN(amt) || amt <= 0) {
      setTrfFee(0);
      setTrfTotalDebit(0);
      if (isBulkMode) {
        setTrfAmount("0");
      }
      return;
    }

    if (isBulkMode) {
      setTrfAmount(amt.toString());
    }

    const fetchFee = async () => {
      setIsFeeLoading(true);
      try {
        let idToken = "mock-token";
        if (user && sessionStorage.getItem("mock") !== "true") {
          idToken = await user.getIdToken();
        }

        const amountsParam = isBulkMode ? bulkRecipients.map((r) => r.amount).join(",") : "";
        const url = isBulkMode
          ? `/api/flutterwave/transfer-fee?amount=${amt}&bulk=true&count=${bulkRecipients.length}&amounts=${amountsParam}`
          : `/api/flutterwave/transfer-fee?amount=${amt}`;

        const res = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setTrfFee(data.fee);
          setTrfTotalDebit(data.totalDebit);
          setTrfFeeData(data);
        } else {
          // Fallback to 0 if server estimation is unavailable
          setTrfFee(0);
          setTrfTotalDebit(amt);
          setTrfFeeData(null);
        }
      } catch {
        setTrfFee(0);
        setTrfTotalDebit(amt);
      } finally {
        setIsFeeLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchFee();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [trfAmount, bulkRecipients, isBulkMode, user]);

  // Load the permanent virtual account dynamically from Firestore (Idempotent check/load)
  const fetchPermanentVirtualAccount = async () => {
    if (!user) return;
    const isMock = sessionStorage.getItem("mock") === "true";
    if (isMock) {
      setPermanentAccount({
        bankName: "Wema Bank",
        accountNumber: "9921473281",
        accountName: resolvedName,
      });
      return;
    }

    setIsPermAccountLoading(true);
    try {
      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      const fullname = userData?.name || user?.displayName || "Captain User";
      const nameParts = fullname.trim().split(/\s+/);
      const firstname = nameParts[0] || "Customer";
      const lastname = nameParts.slice(1).join(" ") || "Wallet";

      const payload = {
        email: user?.email || userData?.email || `user-${user?.uid}@e-tech-hub.com`,
        phone: userData?.phoneNumber || userData?.phone || "08012345678",
        firstname,
        lastname,
        userId: user?.uid,
        isPermanent: true,
        is_permanent: true,
        bvn: userData?.bvn || userData?.nin || "22222222222",
        narration: `${firstname} ${lastname}`.trim().slice(0, 35)
      };

      const res = await fetch("/api/flutterwave/create-virtual-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Raw API response from create-virtual-account:", data);

        let bankName = "";
        let accountNumber = "";
        let accountName = "";

        if (data.account) {
          bankName = data.account.bankName || data.account.bank_name || "";
          accountNumber = data.account.accountNumber || data.account.account_number || "";
          accountName = data.account.accountName || data.account.account_name || "";
        } else if (data.data) {
          bankName = data.data.bankName || data.data.bank_name || "";
          accountNumber = data.data.accountNumber || data.data.account_number || "";
          accountName = data.data.accountName || data.data.account_name || "";
        } else {
          bankName = data.bankName || data.bank_name || "";
          accountNumber = data.accountNumber || data.account_number || "";
          accountName = data.accountName || data.account_name || "";
        }

        const parsedAccount = {
          bankName: String(bankName || "").trim(),
          accountNumber: String(accountNumber || "").trim(),
          accountName: String(accountName || "").trim()
        };

        console.log("Parsed account object:", parsedAccount);

        if (parsedAccount.accountNumber) {
          setPermanentAccount(parsedAccount);
          console.log("React state after update (setPermanentAccount):", parsedAccount);
        } else {
          console.log("Why the Pending card is being rendered: parsedAccount.accountNumber is missing or empty.");
        }
      }
    } catch (err) {
      console.error("Error loading permanent account from Firestore:", err);
    } finally {
      setIsPermAccountLoading(false);
    }
  };

  useEffect(() => {
    if (user && userData?.kycStatus === "VERIFIED") {
      fetchPermanentVirtualAccount();
    } else {
      setPermanentAccount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userData?.kycStatus]);

  // Fetch banks dynamically from our Discovery API endpoint
  const fetchBanks = async () => {
    setIsBanksLoading(true);
    if (sessionStorage.getItem("mock") === "true") {
      setBanksList([
        { id: "035", name: "Wema Bank", code: "035" },
        { id: "058", name: "GTBank", code: "058" },
        { id: "999992", name: "OPay", code: "999992" }
      ]);
      setIsBanksLoading(false);
      return;
    }

    try {
      let idToken = "mock-token";
      if (user && sessionStorage.getItem("mock") !== "true") {
        try {
          idToken = await user.getIdToken();
        } catch (tokenErr) {
          console.error("Failed to retrieve ID token for bank fetch:", tokenErr);
        }
      }

      const res = await fetch("/api/banks", {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Banks API response:", data);
        const banksArray = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.banks)
              ? data.banks
              : Array.isArray(data.data?.banks)
                ? data.data.banks
                : [];
        setBanksList(banksArray);
      } else {
        console.warn("Failed to retrieve dynamic bank codes. Using local cache.");
      }
    } catch (err) {
      console.error("Error retrieving bank codes from server:", err);
    } finally {
      setIsBanksLoading(false);
    }
  };

  // Trigger bank fetch on opening the modal to reduce startup lag
  useEffect(() => {
    if ((isAddMoneyOpen || isTransferOpen) && banksList.length === 0) {
      fetchBanks();
    }
    if (isTransferOpen) {
      shuffleTrfKeypad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddMoneyOpen, isTransferOpen, banksList.length]);

  const fetchInvestmentBalance = async () => {
    if (!user) return;
    const isMock = sessionStorage.getItem("mock") === "true";
    if (isMock) {
      if (typeof window !== "undefined") {
        const saved = sessionStorage.getItem("active_investments");
        if (saved) {
          try {
            const list = JSON.parse(saved);
            if (Array.isArray(list)) {
              const sum = list.reduce((acc: number, curr: { amount: number }) => acc + (parseFloat(curr.amount.toString()) || 0), 0);
              setTotalInvestment(sum);
            }
          } catch {
            // ignore
          }
        }
      }
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/investments", {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.investments)) {
          const activeList = data.investments.filter((inv: { status: string }) => inv.status === "ACTIVE");
          const sum = activeList.reduce((acc: number, curr: { amount: number | string }) => acc + (parseFloat(curr.amount.toString()) || 0), 0);
          setTotalInvestment(sum);
        }
      }
    } catch (err) {
      console.error("Failed to fetch investment balance:", err);
    }
  };

  // Safely calculate active locked savings from sessionStorage or dynamic backend API
  useEffect(() => {
    fetchInvestmentBalance();

    const interval = setInterval(() => {
      fetchInvestmentBalance();
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Timer Countdown Effect
  useEffect(() => {
    if (isAddMoneyOpen && (wizardStep === "ussd-pay" || wizardStep === "transfer-pay")) {
      setTimeLeft(600);
      setPaymentStatus("PENDING");

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setPaymentStatus("EXPIRED");
            stopPolling();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAddMoneyOpen, wizardStep]);

  const stopPolling = () => {
    isPollingActiveRef.current = false;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollInFlightRef.current = false;
  };

  // Status Polling Effect
  const startPolling = (txRef: string) => {
    stopPolling();
    if (!user) {
      console.warn("[Polling Cancelled] No authenticated user present.");
      return;
    }

    isPollingActiveRef.current = true;
    console.log(`[Polling Started] Checking status for txRef: ${txRef}`);

    const executePoll = async () => {
      if (!user || !isPollingActiveRef.current || pollInFlightRef.current) {
        return;
      }

      pollInFlightRef.current = true;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/payments/status?txRef=${encodeURIComponent(txRef)}`, {
          cache: "no-store",
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        });
        const data = await res.json();

        if (!isPollingActiveRef.current) {
          return;
        }

        if (res.status === 401 || res.status === 403) {
          console.warn(`[Polling Stopped] Authorization error ${res.status}`);
          stopPolling();
          return;
        }

        if (data.status === "SUCCESS") {
          const creditedAmt = Number(data.totalCredited ?? data.fundedAmount ?? data.amount ?? 0);
          setConfirmedCreditedAmount(creditedAmt > 0 ? creditedAmt : null);
          setPaymentStatus("PAID");
          stopPolling();
          if (timerRef.current) clearInterval(timerRef.current);
          setWizardStep("success");
          toast.success("Wallet credited successfully!");
          fetchWalletBalances();
          fetchInvestmentBalance();
          window.dispatchEvent(new Event("app-refresh"));
        } else if (data.status === "FAILED" || data.status === "EXPIRED" || data.status === "CANCELED") {
          setConfirmedCreditedAmount(0);
          setPaymentStatus(data.status);
          stopPolling();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      } catch (err) {
        console.error("Polling Error:", err);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    // Immediate initial poll
    executePoll().then(() => {
      // Only start 4-second interval if polling is still active (non-terminal)
      if (isPollingActiveRef.current) {
        pollingRef.current = setInterval(executePoll, 4000);
      }
    });
  };

  // Clean up polling and timers when closing modal or unmounting
  useEffect(() => {
    return () => {
      stopPolling();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleCloseModal = () => {
    setIsAddMoneyOpen(false);
    stopPolling();
    if (timerRef.current) clearInterval(timerRef.current);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("active_funding_session");
    }
    fetchWalletBalances();
    // Reset steps
    setTimeout(() => {
      setWizardStep("amount");
      setAddAmount("");
      setSearchQuery("");
      setSelectedBank(null);
      setUssdCode("");
      setTransferDetails(null);
      setConfirmedCreditedAmount(null);
      setUssdErrorMessage("");
    }, 300);
  };

  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  const handleVerifyPaymentClick = async () => {
    if (!activeTxRef || !user) {
      toast.error("No active payment session found.");
      return;
    }

    setIsVerifyingPayment(true);
    const toastId = toast.loading("Checking payment status...");

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/payments/status?txRef=${encodeURIComponent(activeTxRef)}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.status === "SUCCESS" || data.credited === true || data.alreadyCredited === true) {
        const creditedAmt = Number(data.totalCredited ?? data.fundedAmount ?? data.amount ?? addAmount ?? 0);
        setConfirmedCreditedAmount(creditedAmt > 0 ? creditedAmt : null);
        setPaymentStatus("PAID");
        stopPolling();
        if (timerRef.current) clearInterval(timerRef.current);
        setWizardStep("success");
        toast.success(`Payment received: ₦${creditedAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
        fetchWalletBalances();
        fetchInvestmentBalance();
        window.dispatchEvent(new Event("app-refresh"));
      } else {
        toast.info("Payment not received yet");
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Failed to verify payment. Please try again.");
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  // Restore active funding session when returning from history or on page mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const restoreFundingSession = () => {
      try {
        const saved = sessionStorage.getItem("active_funding_session");
        if (!saved) return;

        const parsed = JSON.parse(saved);
        // Only restore if within 15 minutes (900000 ms)
        if (parsed && parsed.txRef && Date.now() - (parsed.timestamp || 0) < 900000) {
          setActiveTxRef(parsed.txRef);
          if (parsed.addAmount) setAddAmount(parsed.addAmount);
          if (parsed.selectedBank) setSelectedBank(parsed.selectedBank);
          if (parsed.ussdCode) setUssdCode(parsed.ussdCode);
          if (parsed.transferDetails) setTransferDetails(parsed.transferDetails);
          if (parsed.wizardStep) setWizardStep(parsed.wizardStep);

          setIsAddMoneyOpen(true);
          startPolling(parsed.txRef);
        }
      } catch (err) {
        console.warn("[BalanceCard] Restore funding session exception:", err);
      }
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("fromHistoryReturn") === "true" || urlParams.get("returnToFunding") === "true") {
      restoreFundingSession();
    }
  }, []);

  // Close Outward Transfer Drawer
  const handleCloseTransferModal = () => {
    setIsTransferOpen(false);
    setIsTrfContentReady(false);
    setTimeout(() => {
      setTrfStep("input");
      setTrfBank(null);
      setTrfAccount("");
      setTrfAccountName("");
      setTrfAmount("");
      setTrfFee(0);
      setTrfTotalDebit(0);
      setTrfPin("");
      setTransferResult(null);
      setCompletedTxForReceipt(null);
      setOpenWithShareModal(false);
      setIsBeneficiarySaved(false);
      setBankSearchQuery("");
      setShowTrfBankSelector(false);
      setIsBulkMode(false);
      setBulkRecipients([]);
      setBulkBank(null);
      setBulkAccount("");
      setBulkName("");
      setBulkAmountVal("");

    }, 300);
  };

  const buildCompletedTransaction = (): Transaction => {
    return {
      id: transferResult?.reference || `trf-${Date.now()}`,
      reference: transferResult?.reference || `trf-${Date.now()}`,
      type: "TRANSFER",
      category: "TRANSFER",
      direction: "DEBIT",
      amount: parseFloat(trfAmount) || 0,
      currency: "NGN",
      fee: trfFee,
      totalDebited: trfTotalDebit,
      status: "SUCCESS",
      description: trfNarration.trim() || `Transfer to ${trfAccountName}`,
      narration: trfNarration.trim() || `Transfer to ${trfAccountName}`,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      recipientName: isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName,
      beneficiaryName: isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName,
      recipientBankName: isBulkMode ? "Multiple Banks" : trfBank?.name,
      beneficiaryBankName: isBulkMode ? "Multiple Banks" : trfBank?.name,
      recipientAccountNumber: isBulkMode ? "Multiple" : trfAccount,
      beneficiaryAccountNumber: isBulkMode ? "Multiple" : trfAccount,
      recipientBankCode: trfBank?.code,
      beneficiaryBankCode: trfBank?.code,
      senderName: String(userData?.name || userData?.displayName || "Account Holder"),
    };
  };

  const handleViewReceipt = () => {
    const completedTx = buildCompletedTransaction();
    setCompletedTxForReceipt(completedTx);
    setOpenWithShareModal(false);
  };

  const handleShareReceiptClick = () => {
    const completedTx = buildCompletedTransaction();
    setCompletedTxForReceipt(completedTx);
    setOpenWithShareModal(true);
  };

  const handleSaveBeneficiaryAction = async () => {
    if (isBeneficiarySaved) return;
    if (isBulkMode) {
      await handleSaveBulkBeneficiaries();
    } else {
      await handleSaveBeneficiary();
    }
    setIsBeneficiarySaved(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const outstandingDebt = selectedCurrency === "NGN" ? (Number(userData?.outstandingDebt) || 0) : 0;
  const rawBalance = selectedCurrency === "NGN"
    ? walletBalances.NGN
    : (selectedCurrency === "USD" ? walletBalances.USD : walletBalances.XOF);

  const netBalance = rawBalance - outstandingDebt;

  const formattedBalance = new Intl.NumberFormat(
    selectedCurrency === "NGN" ? "en-NG" : (selectedCurrency === "USD" ? "en-US" : "fr-FR"),
    {
      style: "currency",
      currency: selectedCurrency,
      minimumFractionDigits: 2,
    }
  ).format(netBalance);

  const balanceStr = isVisible
    ? formattedBalance
    : (selectedCurrency === "NGN" ? "₦ •••,•••.••" : (selectedCurrency === "USD" ? "$ •••,•••.••" : "CFA •••,•••.••"));

  // Dynamic font scaling
  let fontSizeClass = "text-[20px] min-[360px]:text-[24px] min-[400px]:text-[30px] md:text-[36px] lg:text-[40px]";
  if (balanceStr.length > 24) {
    fontSizeClass = "text-[12px] min-[360px]:text-[14px] min-[400px]:text-[16px]";
  } else if (balanceStr.length > 20) {
    fontSizeClass = "text-[14px] min-[360px]:text-[16px] min-[400px]:text-[18px]";
  } else if (balanceStr.length > 16) {
    fontSizeClass = "text-[16px] min-[360px]:text-[18px] min-[400px]:text-[20px]";
  } else if (balanceStr.length > 12) {
    fontSizeClass = "text-[18px] min-[360px]:text-[21px] min-[400px]:text-[24px]";
  }

  const handlePresetClick = (val: number) => {
    setAddAmount(val.toString());
  };

  const handleAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(addAmount);

    if (isNaN(parsedAmount) || parsedAmount < 100) {
      toast.error("Minimum allowed funding amount is ₦100.00");
      return;
    }

    setWizardStep("methods");
    setIsMethodsLoading(true);
    setTimeout(() => {
      setIsMethodsLoading(false);
    }, 800);
  };


  const handleAddBulkRecipient = () => {
    const activeMinTransfer = Number(config.minTransferAmount ?? (config as any).globalMinTransferAmount) || 100;
    const amt = parseFloat(bulkAmountVal);

    if (isNaN(amt) || amt < activeMinTransfer) {
      toast.error(`Minimum transfer amount per recipient is ₦${activeMinTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`);
      return;
    }

    if (!bulkBank || bulkAccount.length !== 10 || !bulkName) {
      toast.error("Complete verification and specify a positive amount first.");
      return;
    }

    const uniqueKey = `${bulkBank.id}-${bulkAccount}`;
    if (bulkRecipients.some(r => `${r.bankId}-${r.accountNumber}` === uniqueKey)) {
      toast.error("This recipient is already added to this batch!");
      return;
    }

    setBulkRecipients([
      ...bulkRecipients,
      {
        accountNumber: bulkAccount,
        bankId: bulkBank.id,
        bankCode: bulkBank.code || bulkBank.id,
        bankName: bulkBank.name,
        recipientName: bulkName,
        amount: amt,
        logoUrl: bulkBank.logoUrl,
        logoBackupUrl: (bulkBank as any).logoBackupUrl,
      }
    ]);

    // Reset inputs
    setBulkAccount("");
    setBulkName("");
    setBulkAmountVal("");
    toast.success("Recipient added successfully!");
  };

  const handleRemoveBulkRecipient = (index: number) => {
    setBulkRecipients(bulkRecipients.filter((_, i) => i !== index));
  };

  // Card payment initialization (using safest/existing hosted checkout approach as allowed)
  const handleCardPaymentSubmit = async () => {
    setIsInitializing(true);
    toast.loading("Contacting Flutterwave secure payment element...");

    try {
      let idToken = "mock-token";
      if (user && sessionStorage.getItem("mock") !== "true") {
        try {
          idToken = await user.getIdToken();
        } catch (tokenErr) {
          console.error("Failed to retrieve ID token for initialization:", tokenErr);
        }
      }

      const payload = {
        amount: parseFloat(addAmount),
        currency: "NGN",
        email: user?.email || "captain@example.com",
        name: userData?.name || user?.displayName || "Captain Wallet",
        userId: user?.uid || "anon",
        redirectUrl: `${window.location.origin}/?verify=flw`,
      };

      const res = await fetch("/api/flutterwave/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      toast.dismiss();

      if (data.success && data.paymentLink) {
        toast.success("Redirecting to secure card gateway...");
        window.location.href = data.paymentLink;
      } else {
        toast.error(data.error || "Failed to initialize payment gateway.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error.");
    } finally {
      setIsInitializing(false);
    }
  };

  // USSD Bank Selection Action
  const handleBankSelect = async (bank: { id: string; name: string; code?: string }) => {
    setSelectedBank(bank);
    setUssdErrorMessage("");
    setIsInitializing(true);
    toast.loading(`Generating USSD dialing instructions for ${bank.name}...`);

    try {
      let idToken = "mock-token";
      let activeSessionId = "";
      if (typeof window !== "undefined") {
        activeSessionId = localStorage.getItem("active_session_id") || "";
      }
      if (user && sessionStorage.getItem("mock") !== "true") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/payments/ussd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {}),
        },
        body: JSON.stringify({
          amount: parseFloat(addAmount),
          currency: "NGN",
          bankId: bank.id,
          bank_code: bank.code || bank.id,
          bankName: bank.name,
          email: user?.email || "captain@example.com",
          name: userData?.name || user?.displayName || "Captain Wallet",
          phone: userData?.phoneNumber || "08012345678",
        }),
      });

      const data = await res.json();
      toast.dismiss();

      if (res.ok && data.success) {
        setUssdCode(data.ussdCode);
        setActiveTxRef(data.txRef);
        setWizardStep("ussd-pay");
        startPolling(data.txRef);
      } else {
        const errMsg = data.error || data.message || "Selected bank is temporarily offline.";
        console.warn("USSD initiation error:", errMsg);
        setUssdErrorMessage(errMsg);
        toast.error(errMsg);
      }
    } catch (err: unknown) {
      toast.dismiss();
      const error = err as Error;
      const errMsg = error?.message || "Internal connection error.";
      setUssdErrorMessage(errMsg);
      toast.error(errMsg);
    } finally {
      setIsInitializing(false);
    }
  };

  // Bank Transfer Payment Generation Action
  const handleBankTransferInit = async () => {
    setIsInitializing(true);
    toast.loading("Allocating secure dynamic Wema virtual account...");

    try {
      let idToken = "mock-token";
      let activeSessionId = "";
      if (typeof window !== "undefined") {
        activeSessionId = localStorage.getItem("active_session_id") || "";
      }
      if (user && sessionStorage.getItem("mock") !== "true") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/payments/bank-transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {}),
        },
        body: JSON.stringify({
          amount: parseFloat(addAmount),
          currency: "NGN",
          email: user?.email || "captain@example.com",
          name: userData?.name || user?.displayName || "Captain Wallet",
          phone: userData?.phoneNumber || "08012345678",
        }),
      });

      const data = await res.json();
      toast.dismiss();

      if (data.success) {
        setTransferDetails({
          transferAccount: data.transferAccount,
          transferBank: data.transferBank,
          transferAmount: data.transferAmount,
          transferReference: data.transferReference,
          transferNote: data.transferNote,
        });
        setActiveTxRef(data.txRef);
        setWizardStep("transfer-pay");
        startPolling(data.txRef);
      } else {
        toast.error(data.error || "Dynamic account allocation failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Internal connection error.");
    } finally {
      setIsInitializing(false);
    }
  };

  // Execute Direct Outward Transfer (Single or Bulk)
  const executeOutwardTransfer = async (completedPin?: string, isBiometricAuthenticated?: boolean) => {
    if (!isFeatureEnabled(config?.featureToggles, "transfer")) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, "transfer"));
      return;
    }
    setIsTransferring(true);

    if (isBulkMode) {
      toast.loading("Queuing and verifying bulk transfer batch...");
      try {
        let idToken = "mock-token";
        if (user && sessionStorage.getItem("mock") !== "true") {
          idToken = await user.getIdToken();
        }

        const res = await fetch("/api/flutterwave/bulk-transfer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            title: "Staff December Settlement",
            recipients: bulkRecipients,
            pin: completedPin,
            isBiometricAuthenticated,
          }),
        });

        const data = await res.json();
        toast.dismiss();

        if (res.ok && data.success) {
          setIsTransferring(false);
          setTransferResult({
            success: true,
            message: `Your bulk transfer of ${bulkRecipients.length} recipients has been successfully queued in the background!`,
            reference: data.bulkTransferId || data.reference,
          });
          handleSaveBulkRecents();
          setTrfStep("completion");
          toast.success("Bulk batch queued successfully!");
          if (typeof data.walletBalance === "number") {
            setWalletBalances((prev) => ({ ...prev, NGN: data.walletBalance }));
          }
          fetchWalletBalances();
          window.dispatchEvent(new Event("app-refresh"));
        } else {
          setTrfPin("");
          const backendErr = data.error || data.message || data.data?.message || "Bulk transfer queuing failed.";
          toast.error(backendErr);
        }
      } catch {
        toast.dismiss();
        setTrfPin("");
        toast.error("Internal connection error during bulk transfer.");
      } finally {
        setIsTransferring(false);
      }
      return;
    }

    toast.loading("Initiating secure outward transfer with bank...");

    try {
      let idToken = "mock-token";
      if (user && sessionStorage.getItem("mock") !== "true") {
        idToken = await user.getIdToken();
      }

      const transferReference = `trf-${Date.now()}-${user?.uid?.slice(-6)}`;

      // Strict payload adhering to TASK 2 with both camelCase and snake_case properties
      const payload = {
        amount: parseFloat(trfAmount),
        account_number: trfAccount,
        accountNumber: trfAccount,
        account_bank: trfBank?.code || trfBank?.id,
        accountBank: trfBank?.code || trfBank?.id,
        bankCode: trfBank?.code || trfBank?.id,
        account_name: trfAccountName,
        accountName: trfAccountName,
        currency: "NGN",
        narration: trfNarration.trim() || undefined,
        recipientName: trfAccountName,
        recipientAccount: trfAccount,
        reference: transferReference,
        beneficiary_name: trfAccountName,
        beneficiaryName: trfAccountName,
        pin: completedPin,
        isBiometricAuthenticated,
      };
      console.log("Outward Transfer Payload to VM Payment Gateway:", payload);

      const res = await fetch("/api/flutterwave/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      toast.dismiss();

      if (res.ok && data.success) {
        setIsTransferring(false);
        setTransferResult({
          success: true,
          message: `Your outward bank transfer has been initiated successfully! ₦${parseFloat(trfAmount).toLocaleString()} is being settled to ${trfAccountName}.`,
          reference: data.reference,
        });
        const isAlreadySaved = beneficiaries.some((b) => b.accountNumber === trfAccount);
        setIsBeneficiarySaved(isAlreadySaved);
        handleSaveRecent();
        setTrfStep("completion");

        // The API has already atomically debited the wallet. Apply the
        // server-confirmed post-debit balance immediately, then re-fetch
        // to reconcile all wallet fields without a second debit.
        if (typeof data.walletBalance === "number") {
          setWalletBalances((prev) => ({ ...prev, NGN: data.walletBalance }));
        }
        fetchWalletBalances();
        window.dispatchEvent(new Event("app-refresh"));

        toast.success("Transfer initiated successfully!");
      } else {
        setTrfPin("");
        // Specific improved error reporting from backend (TASK 4)
        const backendErr = data.error || data.message || data.data?.message || "Transfer failed. Please check details or PIN.";
        toast.error(backendErr);
      }
    } catch (err: unknown) {
      toast.dismiss();
      setTrfPin("");
      const error = err as Error;
      toast.error(error.message || "Internal connection error during transfer.");
    } finally {
      setIsTransferring(false);
    }
  };

  const [isTrf2faStage, setIsTrf2faStage] = useState(false);
  const [trfVerifiedPin, setTrfVerifiedPin] = useState("");

  const [isSwap2faStage, setIsSwap2faStage] = useState(false);
  const [swapVerifiedPin, setSwapVerifiedPin] = useState("");

  const handleBiometricTransferAuth = async () => {
    if (!navigator.onLine) {
      toast.error("Internet connection required to verify biometrics.");
      return;
    }
    const label = getBiometricLabel();
    toast.loading(`Authenticating ${label}...`);
    const res = await authenticateBiometricDetailed(`Authorize ₦${trfTotalDebit.toLocaleString()} transfer`);
    toast.dismiss();

    if (res.success) {
      toast.success(`${label} Authenticated!`);
      if (userData?.isBiometricTransferEnabled !== true) {
        updateUserData({ isBiometricTransferEnabled: true, isBiometricLoginEnabled: true, isFaceIdEnabled: true }).catch(() => {});
      }
      if (userData?.is2faOtpEnabled === true) {
        setTrfVerifiedPin("");
        setIsTrf2faStage(true);
      } else {
        executeOutwardTransfer(undefined, true);
      }
    } else if (res.cancelled) {
      // User cancelled biometric prompt cleanly
    } else {
      toast.error(res.message || `${label} authentication failed.`);
    }
  };

  const handleTrfPinPress = (num: string) => {
    if (trfPin.length < 4) {
      const nextPin = trfPin + num;
      setTrfPin(nextPin);
      if (nextPin.length === 4) {
        if (userData?.is2faOtpEnabled === true) {
          setTrfVerifiedPin(nextPin);
          setIsTrf2faStage(true);
        } else {
          executeOutwardTransfer(nextPin);
        }
      }
    }
  };

  const handleTrfPinDelete = () => {
    setTrfPin(trfPin.slice(0, -1));
  };

  const generateReceiptBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // 1. Background
      ctx.fillStyle = "#F8FAFC"; // Slate-50 background
      ctx.fillRect(0, 0, 600, 800);

      // Inner card background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(30, 30, 540, 740);

      // Draw borders/shadow representation
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 540, 740);

      // 2. Header Logo Banner (E-Tech Theme)
      ctx.fillStyle = "#FC7A00"; // Signature brand orange
      ctx.fillRect(30, 30, 540, 90);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 24px 'Arial', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("E-TECH GLOBAL HUB", 300, 80);

      // Header label
      ctx.fillStyle = "#1E293B"; // Slate-800
      ctx.font = "800 16px 'Arial', sans-serif";
      ctx.fillText("OFFICIAL TRANSACTION RECEIPT", 300, 165);

      // Draw Success Icon Check
      ctx.fillStyle = "#10B981"; // emerald-500
      ctx.beginPath();
      ctx.arc(300, 220, 30, 0, 2 * Math.PI);
      ctx.fill();

      // Checkmark sign
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(288, 220);
      ctx.lineTo(297, 229);
      ctx.lineTo(314, 212);
      ctx.stroke();

      // SUCCESSFUL text
      ctx.fillStyle = "#10B981";
      ctx.font = "bold 14px 'Arial', sans-serif";
      ctx.fillText("TRANSFER SUCCESSFUL", 300, 275);

      // 3. Draw transaction parameter rows
      const rows = [
        { label: "RECIPIENT", value: isBulkMode ? "BATCH RECIPIENTS" : (trfAccountName || "BENEFICIARY").toUpperCase() },
        { label: "BANK", value: isBulkMode ? "MULTIPLE BANKS" : (trfBank?.name || "N/A").toUpperCase() },
        { label: "ACCOUNT NUMBER", value: isBulkMode ? "MULTIPLE" : trfAccount },
        { label: "AMOUNT DEBITED", value: `₦${parseFloat(trfAmount || "0").toLocaleString("en-NG", { minimumFractionDigits: 2 })}` },
        { label: "TRANSACTION FEE", value: `₦${trfFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` },
        { label: "REFERENCE CODE", value: transferResult?.reference || "N/A" },
        { label: "SETTLEMENT DATE", value: new Date().toLocaleString() },
        { label: "STATUS", value: "SUCCESSFUL" }
      ];

      let startY = 320;
      const rowHeight = 42;

      ctx.textAlign = "left";
      rows.forEach((row) => {
        // Draw row lines
        ctx.strokeStyle = "#F1F5F9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(60, startY + 8);
        ctx.lineTo(540, startY + 8);
        ctx.stroke();

        // Label
        ctx.fillStyle = "#64748B"; // Slate-500
        ctx.font = "700 11px 'Arial', sans-serif";
        ctx.fillText(row.label, 60, startY);

        // Value
        ctx.textAlign = "right";
        if (row.label === "AMOUNT DEBITED") {
          ctx.fillStyle = "#10B981"; // Green amount
          ctx.font = "900 13px 'Arial', sans-serif";
        } else if (row.label === "STATUS") {
          ctx.fillStyle = "#10B981"; // Success pill representation
          ctx.font = "bold 12px 'Arial', sans-serif";
        } else {
          ctx.fillStyle = "#0F172A"; // Dark value
          ctx.font = "bold 12px 'Arial', sans-serif";
        }
        ctx.fillText(row.value, 540, startY);
        ctx.textAlign = "left"; // Reset align

        startY += rowHeight;
      });

      // 4. Draw Footer
      ctx.textAlign = "center";
      ctx.fillStyle = "#94A3B8"; // Slate-400
      ctx.font = "italic 11px 'Arial', sans-serif";
      ctx.fillText("Thank you for choosing E-Tech Global Hub.", 300, 690);
      ctx.fillText("This is an official transaction document and serves as proof of payment.", 300, 710);
      ctx.fillText("Support: support@etechglobalhub.com", 300, 730);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/png");
    });
  };

  const downloadReceiptImage = async () => {
    try {
      const blob = await generateReceiptBlob();
      if (!blob) {
        toast.error("Unable to generate receipt image.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `Receipt_${transferResult?.reference || "transfer"}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Receipt image downloaded successfully!");
    } catch (err) {
      console.error("Receipt download error:", err);
      toast.error("Failed to export receipt image.");
    }
  };

  const shareReceiptImage = async () => {
    try {
      const blob = await generateReceiptBlob();
      const ref = transferResult?.reference || "transfer";
      const receiptTitle = "Transaction Receipt";
      const recipientText = isBulkMode ? "Batch Recipients" : trfAccountName;
      const amountText = `₦${parseFloat(trfAmount || "0").toLocaleString()}`;
      const summaryText = `Transaction Receipt from E-Tech Global Hub\nRecipient: ${recipientText}\nAmount: ${amountText}\nRef: ${ref}\nDate: ${new Date().toLocaleString()}`;

      if (blob && navigator.share && navigator.canShare) {
        const file = new File([blob], `Receipt_${ref}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: receiptTitle,
            text: summaryText,
            files: [file],
          });
          toast.success("Receipt shared successfully!");
          return;
        }
      }

      // Fallback 1: Text Web Share API
      if (navigator.share) {
        await navigator.share({
          title: receiptTitle,
          text: summaryText,
        });
        toast.success("Receipt shared successfully!");
        return;
      }

      // Fallback 2: WhatsApp Web/App Direct Deep Link
      const waUrl = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      toast.success("Opening WhatsApp to share receipt...");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return; // User cancelled share dialog
      }
      console.warn("Share error, falling back to clipboard:", err);
      const summaryText = `Transaction Receipt from E-Tech Global Hub\nRecipient: ${isBulkMode ? "Batch Recipients" : trfAccountName}\nAmount: ₦${parseFloat(trfAmount || "0").toLocaleString()}\nRef: ${transferResult?.reference || ""}\nDate: ${new Date().toLocaleString()}`;
      navigator.clipboard.writeText(summaryText);
      toast.success("Receipt details copied to clipboard!");
    }
  };

  const downloadReceiptPDF = () => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      toast.error("Unable to generate PDF receipt");
      return;
    }

    const htmlContent = "\n      <!DOCTYPE html>\n      <html>\n      <head>\n        <title>Transaction Receipt</title>\n        <style>" + "\n          body {\n            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;\n            color: #333;\n            padding: 40px;\n            background-color: #fff;\n          }\n          .receipt-card {\n            border: 1px solid #e2e8f0;\n            border-radius: 16px;\n            max-width: 600px;\n            margin: 0 auto;\n            overflow: hidden;\n            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);\n          }\n          .header {\n            background: linear-gradient(135deg, #FC7A00, #E06600);\n            color: #fff;\n            padding: 30px;\n            text-align: center;\n          }\n          .header h1 {\n            margin: 0;\n            font-size: 26px;\n            font-weight: 900;\n            letter-spacing: 1px;\n          }\n          .header p {\n            margin: 5px 0 0 0;\n            font-size: 12px;\n            opacity: 0.9;\n            font-weight: bold;\n          }\n          .success-badge {\n            text-align: center;\n            margin-top: -20px;\n          }\n          .badge-inner {\n            background-color: #10B981;\n            color: white;\n            display: inline-block;\n            padding: 10px 24px;\n            border-radius: 50px;\n            font-weight: 900;\n            font-size: 14px;\n            box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);\n          }\n          .details-container {\n            padding: 40px;\n          }\n          .row {\n            display: flex;\n            justify-content: space-between;\n            padding: 12px 0;\n            border-bottom: 1px solid #f1f5f9;\n            font-size: 14px;\n          }\n          .label {\n            color: #64748b;\n            font-weight: bold;\n            text-transform: uppercase;\n            font-size: 11px;\n            letter-spacing: 0.5px;\n          }\n          .value {\n            color: #0f172a;\n            font-weight: bold;\n            text-align: right;\n          }\n          .value.amount {\n            color: #10B981;\n            font-size: 18px;\n            font-weight: 900;\n          }\n          .value.success {\n            color: #10B981;\n          }\n          .footer {\n            text-align: center;\n            padding: 30px;\n            background-color: #f8fafc;\n            border-top: 1px solid #e2e8f0;\n            font-size: 12px;\n            color: #94a3b8;\n            line-height: 1.6;\n          }\n          @media print {\n            body {\n              padding: 0;\n            }\n            .receipt-card {\n              border: none;\n              box-shadow: none;\n              max-width: 100%;\n            }\n          }\n        " + "</style>\n      </head>\n      <body>\n        <div class=\"receipt-card\">\n          <div class=\"header\">\n            <h1>E-TECH GLOBAL HUB</h1>\n            <p>OFFICIAL TRANSACTION DOCUMENT</p>\n          </div>\n          <div class=\"success-badge\">\n            <div class=\"badge-inner\">✓ SUCCESSFUL</div>\n          </div>\n          <div class=\"details-container\">\n            <div class=\"row\">\n              <span class=\"label\">Recipient Name</span>\n              <span class=\"value\">${isBulkMode ? \"Batch Recipients\" : (trfAccountName || \"Beneficiary\").toUpperCase()}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Destination Bank</span>\n              <span class=\"value\">${isBulkMode ? \"Multiple Banks\" : (trfBank?.name || \"N/A\").toUpperCase()}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Account Number</span>\n              <span class=\"value\">${isBulkMode ? \"Multiple\" : trfAccount}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Amount Debited</span>\n              <span class=\"value amount\">₦${parseFloat(trfAmount).toLocaleString(\"en-NG\", { minimumFractionDigits: 2 })}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Transfer Fee</span>\n              <span class=\"value\">₦${trfFee.toLocaleString(\"en-NG\", { minimumFractionDigits: 2 })}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Reference Code</span>\n              <span class=\"value\" style=\"font-family: monospace;\">${transferResult?.reference || \"N/A\"}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Settlement Date</span>\n              <span class=\"value\">${new Date().toLocaleString()}</span>\n            </div>\n            <div class=\"row\">\n              <span class=\"label\">Status</span>\n              <span class=\"value success\">SUCCESSFUL</span>\n            </div>\n          </div>\n          <div class=\"footer\">\n            <strong>Thank you for choosing E-Tech Global Hub.</strong><br/>\n            This receipt serves as official proof of outward payment processing.<br/>\n            Support: support@etechglobalhub.com\n          </div>\n        </div>\n      </body>\n      </html>\n    ";

    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Trigger Print once fully loaded
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove iframe after print dialog opens
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Filter bank query
  const filteredBanks = Array.isArray(banksList) ? banksList.filter(b =>
    b.name && b.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  // Filter bank query (Outward transfer)
  const filteredTrfBanks = Array.isArray(banksList) ? banksList.filter(b =>
    b.name && b.name.toLowerCase().includes(bankSearchQuery.toLowerCase())
  ) : [];

  return (
    <>
    <div className="relative p-[1px] rounded-2xl bg-gradient-to-r from-[#FC7A00] to-[#E06600] w-full max-w-[280px] mx-auto mb-5 shadow-sm select-none">
      <div className="bg-white rounded-[15px] p-1 flex w-full relative overflow-hidden">
        {["NGN", "USD", "XOF"]
          .filter((curr) => curr === "NGN" || currencyVisibility[curr] !== false)
          .map((curr) => {
            const isActive = selectedCurrency === curr;
            return (
              <button
                key={curr}
                onClick={() => {
                  setSelectedCurrency(curr);
                  toast.info(`Switched to ${curr} Wallet`);
                }}
                className={`relative flex-1 py-2 text-xs font-extrabold uppercase tracking-widest rounded-xl transition-colors duration-300 focus:outline-none z-10 cursor-pointer ${
                  isActive ? "text-white" : "text-gray-400 hover:text-black"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeCurrencyTab"
                    className="absolute inset-0 bg-gradient-to-r from-[#FC7A00] to-[#E06600] rounded-xl -z-10 shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {curr}
              </button>
            );
          })}
      </div>
    </div>

    <motion.section
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-stack-lg text-black w-full cursor-grab active:cursor-grabbing select-none"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15}
      onDragEnd={(event, info) => {
        const threshold = 60; // minimum drag distance in pixels to trigger transition
        if (info.offset.x < -threshold) {
          // Dragged left -> NGN -> USD -> XOF
          if (selectedCurrency === "NGN") {
            setSelectedCurrency("USD");
            toast.info("Switched to USD Wallet");
          } else if (selectedCurrency === "USD") {
            setSelectedCurrency("XOF");
            toast.info("Switched to XOF Wallet");
          }
        } else if (info.offset.x > threshold) {
          // Dragged right -> XOF -> USD -> NGN
          if (selectedCurrency === "XOF") {
            setSelectedCurrency("USD");
            toast.info("Switched to USD Wallet");
          } else if (selectedCurrency === "USD") {
            setSelectedCurrency("NGN");
            toast.info("Switched to NGN Wallet");
          }
        }
      }}
    >
      {/* Physical Card Design */}
      <div className="relative aspect-[1.586/1] w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group min-h-[175px] min-[360px]:min-h-[195px]">
        <div className="absolute inset-0 bg-[#0c1324]">
            <div className="absolute inset-0 opacity-40"
                 style={{
                    backgroundImage: `radial-gradient(circle at 20% 30%, #FC7A00 0%, transparent 40%),
                                     radial-gradient(circle at 80% 70%, #95d3ba 0%, transparent 40%)`
                 }}
            />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
            <div className="absolute inset-0 gold-shimmer opacity-20"></div>
        </div>

        <div className="relative h-full p-3.5 min-[360px]:p-5 md:p-6 flex flex-col justify-between z-10 w-full overflow-hidden">
          {/* Top Row: Label and Chip */}
          <div className="flex justify-between items-start gap-2 w-full overflow-hidden flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <div className="relative w-5 h-5 flex-shrink-0 flex items-center justify-center animate-fade-in">
                  <AppLogo logoUrl={config.logoUrl} size={20} />
                </div>
                {/* Account Tier Level Badge */}
                <span className="ml-1 px-1.5 py-0.5 text-[7px] min-[360px]:text-[8px] font-black uppercase tracking-wider bg-white/15 text-white rounded-md border border-white/20 backdrop-blur-xs flex-shrink-0">
                  {userData?.kycStatus === "VERIFIED" ? "Tier 3 VIP" : "Tier 1"}
                </span>
              </div>
            </div>
            {/* SIM Chip Icon */}
            <div className="w-7 h-5 min-[360px]:w-9 min-[360px]:h-7 rounded-md bg-gradient-to-br from-[#FC7A00]/80 to-[#FFB870] border border-[#FC7A00]/20 flex flex-col justify-around p-1 overflow-hidden flex-shrink-0">
                <div className="w-full h-[1px] bg-black/20"></div>
                <div className="w-full h-[1px] bg-black/20"></div>
            </div>
          </div>

          {/* Middle: Balance & Available Label */}
          <div className="flex flex-col justify-center gap-0.5 w-full overflow-hidden my-auto py-1 flex-grow">
            <div className="flex justify-between items-center w-full">
              <p className="font-label-sm text-[8px] min-[360px]:text-[10px] text-[#FFFFFF]/70 font-medium">Available Balance</p>
              {isLoading ? (
                <div className="h-4 w-24 bg-white/10 rounded skeleton-shimmer" />
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Savings Badge */}
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md border border-white/5 backdrop-blur-xs select-none">
                    <span className="material-symbols-outlined text-[9px] text-[#FC7A00] font-bold">lock_clock</span>
                    <span className="font-label-sm text-[7.5px] min-[360px]:text-[8.5px] text-[#FFFFFF]/95 font-bold uppercase tracking-wider">
                      Savings: ₦{isVisible ? totalInvestment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "•••,•••"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {isLoading ? (
              <div className="flex items-center justify-between gap-1.5 w-full overflow-hidden mt-1">
                <div className="h-8 min-[360px]:h-10 w-44 rounded-lg bg-white/20 skeleton-shimmer" />
                <button
                  disabled
                  className="text-[#FFFFFF]/40 p-1 flex-shrink-0 cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[15px] min-[360px]:text-[18px] block leading-none">
                    visibility_off
                  </span>
                </button>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={isVisible ? "visible" : "hidden"}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center justify-between gap-1.5 w-full overflow-hidden"
                >
                  <div className="flex-1 min-w-0 text-left">
                    <h2 className={`${fontSizeClass} font-display-lg text-[#FFFFFF] font-bold tracking-tight truncate leading-none`} title={formattedBalance}>
                      {balanceStr}
                    </h2>
                    {selectedCurrency === "NGN" && (
                      <div className="flex items-center gap-2 flex-wrap mt-1 select-none animate-fade-in">
                        <div className="flex items-center gap-1 text-[#FFFFFF]/80">
                          <span className="material-symbols-outlined text-[10px] min-[360px]:text-[12px] text-emerald-400 font-bold animate-pulse" style={{ fontVariationSettings: '"FILL" 1' }}>stars</span>
                          <span className="font-hanken text-[8px] min-[360px]:text-[9.5px] font-bold tracking-wide uppercase">
                            Reward Bonus: ₦{isVisible ? (userData?.bonusBalance !== undefined ? Number(userData.bonusBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "1,000.00") : "•••,•••"}
                          </span>
                        </div>
                        {Number(userData?.outstandingDebt) > 0 && (
                          <div className="flex items-center gap-1 bg-rose-500/30 text-rose-200 px-2 py-0.5 rounded-md border border-rose-400/40 font-hanken text-[8px] min-[360px]:text-[9px] font-black uppercase tracking-wider backdrop-blur-xs">
                            <span className="material-symbols-outlined text-[10px] text-rose-300 font-bold">pending_actions</span>
                            <span>Debt: ₦{isVisible ? Number(userData?.outstandingDebt || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "•••,•••"}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={toggleVisibility}
                    className="text-[#FFFFFF]/80 hover:text-[#FFFFFF] transition-colors p-1 flex-shrink-0 cursor-pointer self-start"
                  >
                    <span className="material-symbols-outlined text-[15px] min-[360px]:text-[18px] text-[#FFFFFF] block leading-none">
                      {isVisible ? "visibility" : "visibility_off"}
                    </span>
                  </button>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Bottom section: Card Number, User Name, Expiry/infinite badge */}
          <div className="space-y-1.5 w-full overflow-hidden flex-shrink-0">
            {isLoading || (selectedCurrency === "NGN" && isPermAccountLoading) ? (
              <div className="space-y-2">
                {/* Skeleton placeholders with precise height and size to prevent layout shift */}
                <div className="flex justify-between items-center">
                  <div className="h-4.5 w-36 bg-white/20 skeleton-shimmer rounded" />
                  <div className="h-3 w-16 bg-white/15 skeleton-shimmer rounded" />
                </div>
                <div className="flex justify-between items-end gap-2 w-full">
                  <div className="flex-1">
                    <div className="h-2 w-16 bg-white/10 skeleton-shimmer rounded mb-1" />
                    <div className="h-3.5 w-24 bg-white/20 skeleton-shimmer rounded" />
                  </div>
                  <div className="h-4.5 w-8 bg-white/10 skeleton-shimmer rounded" />
                </div>
              </div>
            ) : (
              <>
                {/* Prominent Account Number / Card Number styling */}
                <div className="font-mono text-[11px] min-[360px]:text-[13px] min-[390px]:text-[14px] text-white tracking-[0.1em] font-semibold flex flex-wrap items-center justify-between gap-x-2 gap-y-1 select-all leading-none mb-1 w-full overflow-hidden">
                  <span className="whitespace-nowrap">
                    {selectedCurrency === "NGN" ? (
                      permanentAccount ? (
                        permanentAccount.accountNumber.replace(/(\d{4})(\d{4})(\d{2})/, "$1 $2 $3")
                      ) : (
                        "9921 4732 81" // fallback/mock permanent account number format
                      )
                    ) : (
                      usdAccountData ? (
                        usdAccountData.accountNumber.replace(/(\d{4})(\d{4})(\d{2})/, "$1 $2 $3")
                      ) : (
                        "2209 4183 74"
                      )
                    )}
                  </span>
                </div>

                <div className="flex justify-between items-end gap-2 w-full overflow-hidden">
                  <div className="flex-1 min-w-0 text-left">
                      <p className="font-label-sm text-[6.5px] min-[360px]:text-[7.5px] uppercase tracking-wider text-[#FFFFFF]/50 mb-0.5 font-medium truncate">Account Holder</p>
                      <p className="font-label-sm text-[9px] min-[360px]:text-[11px] text-[#FFFFFF] uppercase tracking-widest font-bold truncate leading-none" title={resolvedName}>
                        {resolvedName}
                      </p>
                  </div>
                  {Boolean(userData?.accountId) && (
                    <div className="flex flex-col items-end min-w-0">
                      <p className="font-label-sm text-[6.5px] min-[360px]:text-[7.5px] uppercase tracking-wider text-[#FFFFFF]/50 mb-0.5 font-medium">Account ID</p>
                      <p className="font-mono text-[9px] min-[360px]:text-[11px] text-[#FFFFFF] font-black tracking-widest leading-none">
                        {String(userData?.accountId)}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col items-end flex-shrink-0 bg-white/10 px-2 py-0.5 rounded border border-white/15 backdrop-blur-xs select-none">
                       <span className="font-mono text-[8px] min-[360px]:text-[10px] text-[#FFFFFF] font-black tracking-wider leading-none">{selectedCurrency}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Deposit Limit Exceeded Warning Banner */}
      {(Boolean(userData?.depositLimitExceeded) || (userData?.unlimitedDeposits !== true && (Number(userData?.dailyDepositLimit) || 1000000) > 0 && (Number(userData?.todayDepositTotal) || 0) > (Number(userData?.dailyDepositLimit) || 1000000))) && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3.5 p-3.5 bg-amber-500/10 border-[1.5px] border-amber-500/40 rounded-xl flex items-center justify-between gap-3 text-left relative overflow-hidden select-none shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] font-black animate-pulse">error</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-hanken font-extrabold text-xs text-amber-800 uppercase tracking-wide flex items-center gap-1">
                Deposit Limit Exceeded
              </h4>
              <p className="font-hanken text-[10.5px] text-amber-700 font-bold mt-0.5 leading-snug">
                Your account is pending because your deposit limit was exceeded. You cannot spend funds until upgraded.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { triggerHaptic(); setIsTierUpgradeOpen(true); }}
            className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-xs active:scale-95 shrink-0"
          >
            Upgrade Limit
          </button>
        </motion.div>
      )}

      {/* Frozen Account Alert Notice Banner */}
      {(userData?.isFrozen || userData?.status === "FROZEN") && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3.5 p-3.5 bg-rose-500/10 border-[1.5px] border-rose-500/40 rounded-xl flex items-center gap-3 text-left relative overflow-hidden select-none shadow-sm"
        >
          <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-600 flex-shrink-0">
            <span className="material-symbols-outlined text-[20px] font-black animate-pulse">ac_unit</span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-hanken font-extrabold text-xs text-rose-700 uppercase tracking-wide flex items-center gap-1.5">
              Account Suspended / Frozen
            </h4>
            <p className="font-hanken text-[11px] text-rose-600 font-bold mt-0.5 leading-snug">
              {(userData?.freezeMessage as string) || "Dear Customer please Contact Us or Visit Our Office for assistance"}
            </p>
          </div>
        </motion.div>
      )}

      {/* Action Buttons Below Card */}
      <div className="mt-4 min-[360px]:mt-5 flex gap-2 min-[360px]:gap-3 select-none w-full">
        <motion.button
          disabled={isLoading}
          whileTap={isLoading ? {} : { scale: 0.96 }}
          whileHover={isLoading ? {} : { scale: 1.02 }}
          onClick={() => {
            const isMockMode = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
            if (userData?.kycStatus !== "VERIFIED" && !isMockMode) {
              toast.warning("Please complete your identity verification (KYC) to fund your account.");
              setIsKycDrawerOpen(true);
              return;
            }
            if (selectedCurrency === "USD") {
              setIsUsdFundingOpen(true);
            } else {
              setIsAddMoneyOpen(true);
            }
          }}
          className="flex-1 min-w-0 py-2.5 min-[360px]:py-3.5 px-1.5 min-[360px]:px-2 bg-gradient-to-br from-[#045C1D] via-[#07B038] to-[#034A17] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 hover:brightness-110 active:brightness-95 transition-all duration-300 group cursor-pointer relative overflow-hidden shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-white text-[14px] min-[360px]:text-[16px] font-bold block leading-none group-hover:scale-110 transition-transform duration-300 flex-shrink-0">add_card</span>
          <span className="font-label-sm text-[9px] min-[360px]:text-[11px] text-white tracking-wide uppercase font-bold truncate">
            Fund
          </span>
        </motion.button>

        <motion.button
          disabled={isLoading}
          whileTap={isLoading ? {} : { scale: 0.96 }}
          whileHover={isLoading ? {} : { scale: 1.02 }}
          onClick={() => {
            const isMockMode = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
            if (userData?.kycStatus !== "VERIFIED" && !isMockMode) {
              toast.warning("Please complete your identity verification (KYC) to swap currency.");
              setIsKycDrawerOpen(true);
              return;
            }
            setIsSwapOpen(true);
          }}
          className="flex-1 min-w-0 py-2.5 min-[360px]:py-3.5 px-1.5 min-[360px]:px-2 bg-gradient-to-br from-[#0c1324] via-[#111827] to-[#1e293b] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 hover:brightness-110 active:brightness-95 transition-all duration-300 group cursor-pointer relative overflow-hidden shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-white text-[14px] min-[360px]:text-[16px] font-bold block leading-none group-hover:scale-110 transition-transform duration-300 flex-shrink-0">swap_horiz</span>
          <span className="font-label-sm text-[9px] min-[360px]:text-[11px] text-white tracking-wide uppercase font-bold truncate">
            Swap
          </span>
        </motion.button>

        <motion.button
          disabled={isLoading}
          whileTap={isLoading ? {} : { scale: 0.96 }}
          whileHover={isLoading ? {} : { scale: 1.02 }}
          onClick={() => {
            const isMockMode = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
            if (userData?.kycStatus !== "VERIFIED" && !isMockMode) {
              toast.warning("Please complete your identity verification (KYC) to transfer funds.");
              setIsKycDrawerOpen(true);
              return;
            }
            if (selectedCurrency === "NGN") {
              setIsTransferOpen(true);
            } else {
              toast.info("USD Outward Transfers are coming soon! Swap to NGN to withdraw to domestic bank accounts.");
            }
          }}
          className="flex-1 min-w-0 py-2.5 min-[360px]:py-3.5 px-1.5 min-[360px]:px-2 bg-gradient-to-br from-[#B35200] via-[#FC7A00] to-[#8C4000] border border-white/10 rounded-xl flex items-center justify-center gap-1.5 hover:brightness-110 active:brightness-95 transition-all duration-300 group cursor-pointer relative overflow-hidden shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-white text-[14px] min-[360px]:text-[16px] font-bold block leading-none group-hover:scale-110 transition-transform duration-300 flex-shrink-0">send</span>
          <span className="font-label-sm text-[9px] min-[360px]:text-[11px] text-white tracking-wide uppercase font-bold truncate">
            Transfer
          </span>
        </motion.button>
      </div>

      {/* Premium Verification / KYC Alert Banner */}
      {userData?.kycStatus !== "VERIFIED" && (typeof window === "undefined" || sessionStorage.getItem("mock") !== "true") && (
        <motion.div
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            toast.info("Please complete your identity details to activate unlimited access.");
            setIsKycDrawerOpen(true);
          }}
          className="mt-4 p-4.5 bg-gradient-to-br from-[#FFFDF9] via-[#FFF3E6] to-[#FFEADA] border-[1.5px] border-[#FC7A00]/40 rounded-xl flex items-center justify-between cursor-pointer active:brightness-95 hover:brightness-102 transition-all select-none relative overflow-hidden shadow-none"
        >
          {/* Subtle background luxury badge icon */}
          <div className="absolute right-0 bottom-0 opacity-5 text-[60px] pointer-events-none translate-x-2 translate-y-2 select-none">
            <span className="material-symbols-outlined text-[#FC7A00] font-black">gpp_maybe</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-50 border border-[#FFECD8] flex items-center justify-center text-[#FC7A00] flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] font-bold animate-pulse">gpp_maybe</span>
            </div>
            <div>
              <h4 className="font-hanken font-extrabold text-xs text-black leading-tight">Verify Your Identity (KYC)</h4>
              <p className="font-hanken text-[10.5px] text-gray-500 font-bold uppercase mt-1 tracking-wider leading-none">Link BVN or NIN to activate unlimited deposits & transfers</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-gray-400 text-sm">chevron_right</span>
        </motion.div>
      )}
    </motion.section>

    {/* Add Money Bottom Sheet Overlay Modal */}
    <AnimatePresence>
      {isAddMoneyOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseModal}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
          />

          {/* Full-Screen Immersive Overlay Container */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 350 }}
            className="fixed inset-0 w-full h-full bg-white z-[99999] flex flex-col justify-between overflow-hidden text-black font-hanken will-change-transform max-w-md mx-auto"
          >
            {/* Top Fixed Header Bar */}
            <div className="w-full px-5 py-3.5 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur-md flex-shrink-0">
              {wizardStep !== "amount" && wizardStep !== "success" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === "methods") setWizardStep("amount");
                    else if (wizardStep === "ussd-bank") setWizardStep("methods");
                    else if (wizardStep === "ussd-pay") {
                      stopPolling();
                      setWizardStep("ussd-bank");
                    } else if (wizardStep === "transfer-pay") {
                      stopPolling();
                      setWizardStep("methods");
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 transition-colors cursor-pointer border-0"
                  title="Back"
                >
                  <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
                </button>
              ) : (
                <div className="w-9" />
              )}
              <div className="text-center">
                <h3 className="font-hanken font-extrabold text-base text-black leading-tight">
                  Fund Wallet
                </h3>
                <p className="font-hanken text-[9.5px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  Fast • Secured • Instant Crediting
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">close</span>
              </button>
            </div>

            {/* Scrollable Modal Body Container */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar pb-16">

            {!isFeatureEnabled(config?.featureToggles, "fund_wallet") ? (
              <div className="py-8">
                <FeatureDisabledBanner
                  title="Fund Wallet Unavailable"
                  message={getFeatureDisabledMessage(config?.featureToggles, "fund_wallet")}
                />
              </div>
            ) : (
            <AnimatePresence mode="wait">
              {/* STEP 1: Enter Amount */}
              {wizardStep === "amount" && (
                <motion.form
                  key="step-amount"
                  id="add-money-amount-form"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleAmountSubmit}
                  className="space-y-5"
                >
                  {/* Personal Permanent Virtual Account display widget */}
                  {isPermAccountLoading ? (
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200/50 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex justify-between items-center mb-1">
                        <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-1/3" />
                        <div className="h-4.5 bg-gray-200 rounded skeleton-shimmer w-16" />
                      </div>
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="h-3.5 bg-gray-200 rounded skeleton-shimmer w-1/2" />
                          <div className="h-5 bg-gray-200 rounded skeleton-shimmer w-3/4" />
                          <div className="h-3 bg-gray-100 rounded skeleton-shimmer w-1/4" />
                        </div>
                        <div className="h-8 bg-gray-200 rounded-lg skeleton-shimmer w-14" />
                      </div>
                    </div>
                  ) : null}

                  {userData?.virtualAccountActive === false && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-red-500 text-left mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-red-500 text-[18px]">block</span>
                        <p className="font-hanken font-bold text-xs">Virtual Account Deactivated</p>
                      </div>
                      <p className="font-hanken text-[10.5px] leading-relaxed text-red-400">
                        Your virtual account number has been deactivated by administration. Incoming bank transfers will be held. Contact support to reactivate.
                      </p>
                    </div>
                  )}

                  {showSuccessCard ? (
                    <div className="bg-gradient-to-r from-[#1E293B] to-[#0F172A] border border-white/5 rounded-2xl p-4 text-white relative overflow-hidden select-none">
                      <div className="absolute right-0 bottom-0 opacity-15 text-[100px] select-none pointer-events-none translate-x-1/4 translate-y-1/4">
                        <span className="material-symbols-outlined font-black text-white">account_balance</span>
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-green-400 text-[15px] font-black">check_circle</span>
                          <span className="font-hanken text-[9px] text-gray-300 font-bold uppercase tracking-wider">Your Personal Funding Account</span>
                        </div>
                        <span className="font-mono text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded uppercase font-bold">indefinite use</span>
                      </div>

                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <p className="font-hanken font-bold text-xs text-gray-300 leading-tight">Bank: <strong className="text-white">{permanentAccount?.bankName}</strong></p>
                          <p className="font-mono font-black text-sm text-[#FC7A00] tracking-wider mt-1 select-all">{permanentAccount?.accountNumber}</p>
                          <p className="font-hanken text-[9px] text-gray-400 font-bold uppercase mt-1 truncate max-w-[200px]">{permanentAccount?.accountName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(permanentAccount?.accountNumber || "", "Account number")}
                          className="bg-white/10 hover:bg-white/20 hover:text-white px-2.5 py-1.5 rounded-lg text-gray-200 text-[10px] font-bold tracking-wide active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[13px]">content_copy</span>
                          Copy
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {showPendingCard ? (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-amber-800 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-amber-600 text-[18px]">info</span>
                        <p className="font-hanken font-bold text-xs">Personal Permanent Account Pending</p>
                      </div>
                      <p className="font-hanken text-[10.5px] leading-relaxed text-amber-700">
                        BVN/NIN verification is required by our banking network to activate your permanent NGN account. To fund instantly, please click &quot;Choose Payment Method&quot; below to use dynamic checkouts.
                      </p>
                    </div>
                  ) : null}

                  {/* Referral Program Info Card */}
                  {!!userData?.accountId && (
                    <div className="bg-gradient-to-r from-[#FC7A00]/10 to-[#E06600]/10 border border-[#FC7A00]/20 rounded-2xl p-4 text-black text-left relative overflow-hidden shadow-xs">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="material-symbols-outlined text-[#FC7A00] text-[18px]">group_add</span>
                        <p className="font-hanken font-bold text-xs text-black">Referral Program</p>
                      </div>
                      <p className="font-hanken text-[11px] leading-relaxed text-gray-700">
                        Refer a user with your Account ID <strong className="font-mono text-[#FC7A00] tracking-wider select-all">{String(userData?.accountId || "")}</strong> and you will get <strong className="text-black">₦1,000 Naira</strong> once their account is funded with a minimum of ₦2,000.
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(String(userData?.accountId || ""), "Referral ID")}
                        className="mt-3 bg-[#FC7A00]/15 hover:bg-[#FC7A00]/25 text-[#E06600] border border-[#FC7A00]/30 px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wide active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer w-fit"
                      >
                        <span className="material-symbols-outlined text-[13px]">content_copy</span>
                        Copy Referral ID
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Amount to Fund (NGN)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-lg text-gray-500">₦</span>
                      <input
                        type="number"
                        value={addAmount}
                        onChange={(e) => setAddAmount(e.target.value)}
                        placeholder="Enter amount (e.g. 5000)"
                        required
                        className="w-full bg-white border border-black rounded-2xl pl-10 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mt-1">Minimum funding threshold is ₦100.00</p>
                  </div>

                  {/* Preset select */}
                  <div className="grid grid-cols-4 gap-2">
                    {[1000, 5000, 10000, 20000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetClick(preset)}
                        className="premium-gradient-border py-2.5 bg-white/80 hover:bg-white text-xs font-mono font-black text-black rounded-xl transition-all active:scale-95 cursor-pointer text-center hover:shadow-[0_4px_12px_rgba(252,122,0,0.08)]"
                      >
                        +₦{preset / 1000}K
                      </button>
                    ))}
                  </div>
                </motion.form>
              )}

              {/* STEP 2: Choose Payment Method */}
              {wizardStep === "methods" && (
                <motion.div
                  key="step-methods"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  <p className="text-left font-hanken text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Select Your Preferred Option for ₦{parseFloat(addAmount).toLocaleString()}
                  </p>

                  <div className="flex flex-col gap-3">
                    {isMethodsLoading ? (
                      // High-fidelity payment method shimmering skeletons to guarantee absolutely zero content layout shift
                      [1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-full p-4 rounded-2xl border border-gray-150 bg-gray-50 flex items-center justify-between h-[74px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 skeleton-shimmer flex-shrink-0" />
                            <div className="text-left space-y-1.5">
                              <div className="h-3.5 bg-gray-200 skeleton-shimmer w-24 rounded" />
                              <div className="h-3 bg-gray-100 skeleton-shimmer w-36 rounded" />
                            </div>
                          </div>
                          <div className="w-4.5 h-4.5 bg-gray-200 skeleton-shimmer rounded" />
                        </div>
                      ))
                    ) : (
                      <>
                        {/* Method: Card */}
                        <button
                          type="button"
                          disabled={isInitializing}
                          onClick={handleCardPaymentSubmit}
                          className="w-full p-4 rounded-2xl border border-gray-150 hover:border-[#FC7A00] bg-gray-50 flex items-center justify-between cursor-pointer transition-all active:scale-98 h-[74px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-[20px]">credit_card</span>
                            </div>
                            <div className="text-left">
                              <p className="font-hanken font-extrabold text-xs text-black">Fund with Card</p>
                              <p className="font-hanken text-[10px] text-gray-400">Secure Direct Checkout Element</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </button>

                        {/* Method: USSD */}
                        <button
                          type="button"
                          disabled={isInitializing}
                          onClick={() => setWizardStep("ussd-bank")}
                          className="w-full p-4 rounded-2xl border border-gray-150 hover:border-[#FC7A00] bg-gray-50 flex items-center justify-between cursor-pointer transition-all active:scale-98 h-[74px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-[20px]">cell_tower</span>
                            </div>
                            <div className="text-left">
                              <p className="font-hanken font-extrabold text-xs text-black">Fund with USSD Dial Code</p>
                              <p className="font-hanken text-[10px] text-gray-400">Instant code generation for all bank dials</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </button>

                        {/* Method: Bank Transfer */}
                        <button
                          type="button"
                          disabled={isInitializing}
                          onClick={handleBankTransferInit}
                          className="w-full p-4 rounded-2xl border border-gray-150 hover:border-[#FC7A00] bg-gray-50 flex items-center justify-between cursor-pointer transition-all active:scale-98 h-[74px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined text-[20px]">account_balance</span>
                            </div>
                            <div className="text-left">
                              <p className="font-hanken font-extrabold text-xs text-black">Fund with Direct Bank Transfer</p>
                              <p className="font-hanken text-[10px] text-gray-400">Generate temporary Wema Virtual Account</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {/* STEP 3: USSD Bank Selector */}
              {wizardStep === "ussd-bank" && (
                <motion.div
                  key="step-ussd-bank"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  <p className="text-left font-hanken text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Select Your Bank
                  </p>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search bank (e.g. GTBank, Opay, Moniepoint)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-black rounded-2xl pl-10 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                    />
                  </div>

                  {ussdErrorMessage && (
                    <div className="p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl font-hanken text-[10.5px] font-bold text-left leading-relaxed">
                      {ussdErrorMessage}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-2.5 px-1 pr-1.5 pt-2.5 pb-20 custom-scrollbar max-h-[60vh] min-h-[300px]">
                    {isBanksLoading ? (
                      <div className="p-4 space-y-3.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex justify-between items-center animate-pulse">
                            <div className="h-4 bg-gray-100 rounded w-1/3" />
                            <div className="h-3 bg-gray-100 rounded w-10" />
                          </div>
                        ))}
                      </div>
                    ) : filteredBanks.length === 0 ? (
                      <p className="py-8 text-center text-gray-400 font-hanken text-xs font-semibold">No banks matched.</p>
                    ) : (
                      filteredBanks.map((bank) => {
                        return (
                          <button
                            key={bank.id}
                            type="button"
                            onClick={() => handleBankSelect(bank)}
                            className="w-full p-3.5 rounded-2xl bg-white flex items-center gap-3.5 transition-all duration-300 text-left cursor-pointer shadow-none premium-gradient-border"
                          >
                            <BankLogo name={bank.name} code={bank.code} logoUrl={bank.logoUrl} logoBackupUrl={(bank as any).logoBackupUrl} />
                            <div className="min-w-0 flex-1">
                              <p className="font-hanken text-[12px] font-black text-black leading-tight truncate">{bank.name}</p>
                            </div>
                            <span className="material-symbols-outlined text-gray-400 text-sm">chevron_right</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}

              {/* STEP 4: USSD Checkout/Status Dial Screen */}
              {wizardStep === "ussd-pay" && (
                <motion.div
                  key="step-ussd-pay"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-5 text-center flex flex-col items-center"
                >
                  <div className="w-14 h-14 bg-orange-50 border border-orange-100 text-orange-600 rounded-full flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-[28px]">cell_tower</span>
                  </div>

                  <div>
                    <h4 className="font-hanken font-extrabold text-base text-black">Dial to Complete Payment</h4>
                    <p className="font-hanken text-[11px] text-gray-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
                      Please dial the secure USSD code below on your registered phone to approve the transaction.
                    </p>
                  </div>

                  {/* Code Card */}
                  <div className="w-full bg-white premium-gradient-border rounded-2xl p-5 space-y-3">
                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-100 pb-2 text-gray-500">
                      <span className="font-bold">Bank Name</span>
                      <span className="text-black font-extrabold">{selectedBank?.name}</span>
                    </div>
                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-100 pb-2 text-gray-500">
                      <span className="font-bold">Amount to Pay</span>
                      <span className="text-emerald-600 font-black">₦{parseFloat(addAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-100 pb-2 text-gray-500">
                      <span className="font-bold">Payment Reference</span>
                      <span className="text-black font-mono font-semibold truncate max-w-[180px]">{activeTxRef}</span>
                    </div>

                    <div className="py-3.5 bg-gradient-to-r from-[#FC7A00]/5 to-[#E06600]/5 border border-black rounded-xl flex items-center justify-between px-4 mt-2">
                      <p className="font-mono font-black text-sm text-black select-all tracking-wider">
                        {ussdCode}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(ussdCode, "USSD code")}
                        className="text-[10px] font-black uppercase text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>

                    {/* Direct dial anchor for external phone dialer */}
                    <a
                      href={`tel:${ussdCode.replace(/#/g, "%23")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.open(`tel:${ussdCode.replace(/#/g, "%23")}`, "_system");
                        }
                      }}
                      className="w-full inline-flex py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-xl font-hanken text-xs font-black uppercase tracking-widest active:scale-98 transition-all items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                    >
                      <span className="material-symbols-outlined text-[16px] font-bold">call</span>
                      Dial Instantly
                    </a>
                  </div>

                  {/* Polling / Pending status indicators */}
                  <div className="w-full bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px] animate-spin">
                        progress_activity
                      </span>
                      <span className="font-hanken text-[11px] text-gray-500 font-extrabold">
                        {paymentStatus === "PROCESSING" ? "Processing checkout..." : "Waiting for payment..."}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="block font-hanken text-[9px] text-gray-400 font-bold uppercase tracking-wide">Expires In</span>
                      <span className="font-mono text-[11px] font-black text-rose-500">
                        {formatTime(timeLeft)}
                      </span>
                    </div>
                  </div>

                  {/* "Verify Payment" Button */}
                  <button
                    type="button"
                    disabled={isVerifyingPayment}
                    onClick={handleVerifyPaymentClick}
                    className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl font-hanken text-xs font-black uppercase tracking-wider cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2 shadow-sm border-0 disabled:opacity-50"
                  >
                    {isVerifyingPayment ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Payment...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Verify Payment</span>
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* STEP 5: Bank Transfer dynamic screen */}
              {wizardStep === "transfer-pay" && transferDetails && (
                <motion.div
                  key="step-transfer-pay"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-5 text-center flex flex-col items-center"
                >
                  <div className="w-14 h-14 bg-green-50 border border-green-100 text-green-600 rounded-full flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-[28px]">account_balance_wallet</span>
                  </div>

                  <div>
                    <h4 className="font-hanken font-extrabold text-base text-black">Make Direct Transfer</h4>
                    <p className="font-hanken text-[11px] text-gray-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
                      Please transfer the exact amount to the allocated temporary virtual account below.
                    </p>
                  </div>

                  {/* Code Card */}
                  <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3.5 text-left">
                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-200/60 pb-2 text-gray-500">
                      <span className="font-bold">Bank Name</span>
                      <span className="text-black font-extrabold">{transferDetails.transferBank}</span>
                    </div>

                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-200/60 pb-2 text-gray-500">
                      <span className="font-bold">Account Holder Name</span>
                      <span className="text-black font-extrabold">E-Tech Global Hub</span>
                    </div>

                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-200/60 pb-2 text-gray-500">
                      <span className="font-bold">Amount to Transfer</span>
                      <span className="text-emerald-600 font-black text-xs">₦{transferDetails.transferAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex justify-between font-hanken text-[11px] border-b border-gray-200/60 pb-2 text-gray-500">
                      <span className="font-bold">Transfer Reference</span>
                      <span className="text-black font-mono font-bold select-all">{transferDetails.transferReference}</span>
                    </div>

                    {/* Account Number element */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Account Number</p>
                        <p className="font-mono font-black text-base text-black tracking-widest mt-0.5 select-all">
                          {transferDetails.transferAccount}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(transferDetails.transferAccount, "Account number")}
                        className="text-xs font-bold text-primary hover:text-primary-dark font-hanken bg-[#FFF0E0] px-3.5 py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">content_copy</span>
                        Copy
                      </button>
                    </div>
                  </div>

                  {/* Polling status indicator */}
                  <div className="w-full bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px] animate-spin">
                        progress_activity
                      </span>
                      <span className="font-hanken text-[11px] text-gray-500 font-extrabold">
                        {paymentStatus === "PROCESSING" ? "Processing transfer..." : "Waiting for payment..."}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="block font-hanken text-[9px] text-gray-400 font-bold uppercase tracking-wide">Expires In</span>
                      <span className="font-mono text-[11px] font-black text-rose-500">
                        {formatTime(timeLeft)}
                      </span>
                    </div>
                  </div>

                  {/* "Verify Payment" Button */}
                  <button
                    type="button"
                    disabled={isVerifyingPayment}
                    onClick={handleVerifyPaymentClick}
                    className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl font-hanken text-xs font-black uppercase tracking-wider cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2 shadow-sm border-0 disabled:opacity-50"
                  >
                    {isVerifyingPayment ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying Payment...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Verify Payment</span>
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* STEP 6: Direct Success Screen */}
              {wizardStep === "success" && (
                <motion.div
                  key="step-success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5 text-center flex flex-col items-center py-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto shadow-inner animate-bounce">
                    <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                  </div>

                  <div>
                    <h4 className="font-hanken font-black text-lg text-gray-900 leading-tight">Wallet Credited Successfully!</h4>
                    <p className="font-hanken text-xs text-gray-500 mt-1 font-semibold leading-relaxed max-w-[280px]">
                      Your payment has been confirmed and credited to your available balance.
                    </p>
                  </div>

                  <div className="w-full bg-gray-50 rounded-2xl p-4 border border-gray-150 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-bold uppercase text-[10px]">Transferred Amount</span>
                      <span className="font-mono font-bold text-gray-900">
                        ₦{transferDetails?.transferAmount ? transferDetails.transferAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : (parseFloat(addAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-gray-200/60 pt-2">
                      <span className="text-gray-500 font-bold uppercase text-[10px]">Credited Amount</span>
                      <span className="font-mono text-xl font-black text-emerald-600">
                        +₦{(confirmedCreditedAmount ?? parseFloat(addAmount) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all"
                  >
                    Back to Dashboard
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            )}
            </div>

            {/* Static Bottom Action Bar for Fund Wallet */}
            {isFeatureEnabled(config?.featureToggles, "fund_wallet") && wizardStep === "amount" && (
              <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 shadow-lg z-20">
                <button
                  type="submit"
                  form="add-money-amount-form"
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all border-0 shadow-sm flex items-center justify-center gap-2"
                >
                  <span>Choose Payment Method</span>
                  <span className="material-symbols-outlined text-[16px] font-bold">arrow_forward</span>
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* OUTWARD BANK TRANSFER BOTTOM SHEET MODAL (Premium Moniepoint/OPay style) */}
    <AnimatePresence>
      {isTransferOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseTransferModal}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
          />

          {/* Fullscreen Overlay Loading indicator when sending transfer (TASK 5) */}
          {isTransferring && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[999999] flex flex-col items-center justify-center text-white animate-fade-in select-none">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center p-3.5 mb-4 shadow-2xl">
                <span className="material-symbols-outlined text-white text-[36px] animate-spin">progress_activity</span>
              </div>
              <h4 className="font-hanken font-bold text-base text-white">Sending Transfer...</h4>
              <p className="font-hanken text-xs text-white/75 mt-1.5 font-bold uppercase tracking-widest">Verifying transaction ledger blocks</p>
            </div>
          )}

          {/* Transfer drawer */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
            className="fixed inset-0 w-full h-full max-w-md mx-auto bg-white z-[99999] text-black overflow-hidden flex flex-col will-change-transform"
          >
            <div className="p-6 pb-0 flex flex-col flex-1 overflow-hidden">
            {/* Header row */}
            <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-5 flex-shrink-0">
              {trfStep !== "input" && trfStep !== "completion" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (trfStep === "pin") {
                      setTrfStep("confirm");
                    } else if (trfStep === "confirm") {
                      setTrfStep("input");
                    }
                  }}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">arrow_back</span>
                </button>
              ) : (
                <div className="w-8" />
              )}
              <h3 className="font-hanken font-bold text-base text-black text-center">
                {trfStep === "pin" ? "Authorize Transfer" : "Bank Transfer"}
              </h3>
              <button
                type="button"
                onClick={handleCloseTransferModal}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-16">
            {!isFeatureEnabled(config?.featureToggles, "transfer") ? (
              <div className="py-8">
                <FeatureDisabledBanner
                  title="Bank Transfer Unavailable"
                  message={getFeatureDisabledMessage(config?.featureToggles, "transfer")}
                />
              </div>
            ) : !isTrfContentReady ? (
              <div className="flex-1 flex flex-col items-center justify-center my-auto py-12">
                <div className="w-9 h-9 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin mb-3" />
                <span className="font-hanken text-xs font-bold text-gray-400 uppercase tracking-wider">Loading Transfer Portal...</span>
              </div>
            ) : (
            <AnimatePresence mode="wait">
              {/* STAGE 1: Single or Bulk Mode Recipient Selector */}
              {trfStep === "input" && (
                <motion.div
                  key="trf-input"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4 text-left flex-1 flex flex-col"
                >
                  {/* Top Slide Menu Banner */}
                  {config.bannerTransferPosition !== "bottom" && (
                    <div className="flex-shrink-0">
                      <BannerSlideshow page="transfer" />
                    </div>
                  )}

                  {/* Single/Bulk Toggle Button Bar */}
                  <div className="grid grid-cols-2 p-1 bg-gray-100/80 rounded-full mb-3 border border-gray-200/50 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMode(false);
                      }}
                      className={`py-2.5 text-xs font-black font-hanken rounded-full transition-all duration-300 cursor-pointer ${
                        !isBulkMode ? "bg-[#FC7A00] text-white shadow-none" : "bg-transparent text-gray-400 hover:text-black"
                      }`}
                    >
                      Single Transfer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMode(true);
                      }}
                      className={`py-2.5 text-xs font-black font-hanken rounded-full transition-all duration-300 cursor-pointer ${
                        isBulkMode ? "bg-[#FC7A00] text-white shadow-none" : "bg-transparent text-gray-400 hover:text-black"
                      }`}
                    >
                      Bulk Transfer
                    </button>
                  </div>

                  {!isBulkMode ? (
                    // --- SINGLE TRANSFER INPUT FORM (TASK 1 & BANK DISCOVERY) ---
                    <div className="space-y-4 flex-1">
                      {/* Account Number Input - Rendered first for Automatic Bank Discovery */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Account Number (10 Digits)</label>
                        <input
                          type="number"
                          placeholder="e.g. 0123456789"
                          value={trfAccount}
                          onChange={(e) => {
                            const val = e.target.value.slice(0, 10);
                            setTrfAccount(val);
                            // Clear verified recipient name immediately if account number edits (TASK 1)
                            if (val.length !== 10) {
                              setTrfAccountName("");
                              setIsManualFallback(true);
                            }
                          }}
                          className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                        />
                      </div>

                      {/* Graceful Fallback: Recipient Bank Selector (Shown only if automatic discovery fails or is overridden) */}
                      {isManualFallback && (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Select Destination Bank (Manual Fallback)</label>
                          <button
                            type="button"
                            onClick={handleOpenBankSelector}
                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-left font-hanken text-xs font-extrabold text-black flex items-center justify-between cursor-pointer transition-all hover:bg-gray-100/50"
                          >
                            <span className="flex items-center gap-3">
                              {trfBank ? (
                                <BankLogo name={trfBank.name} code={trfBank.code} logoUrl={trfBank.logoUrl} logoBackupUrl={(trfBank as any).logoBackupUrl} />
                              ) : (
                                <div className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center bg-gray-100 text-gray-400 flex-shrink-0">
                                  <span className="material-symbols-outlined text-[18px]">account_balance</span>
                                </div>
                              )}
                              <span>{trfBank ? trfBank.name : "Choose bank..."}</span>
                            </span>
                            <span className="material-symbols-outlined text-gray-400 text-[16px]">expand_more</span>
                          </button>
                        </div>
                      )}

                      {/* Tappable Recents and Beneficiaries List (Paginates to prevent excessive Firestore reads) */}
                      {trfAccount.length === 0 && (
                        <div className="space-y-3 pt-1 border-t border-gray-100 mt-2">
                          <div className="flex border-b border-gray-200">
                            <button
                              type="button"
                              onClick={() => setListTab("recents")}
                              className={`flex-1 pb-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                listTab === "recents" ? "border-b-2 border-[#FC7A00] text-[#FC7A00]" : "text-gray-400 hover:text-black"
                              }`}
                            >
                              Recent Recipients
                            </button>
                            <button
                              type="button"
                              onClick={() => setListTab("beneficiaries")}
                              className={`flex-1 pb-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                listTab === "beneficiaries" ? "border-b-2 border-[#FC7A00] text-[#FC7A00]" : "text-gray-400 hover:text-black"
                              }`}
                            >
                              Saved Beneficiaries
                            </button>
                          </div>

                          {listTab === "recents" ? (
                            <div className="space-y-2">
                              {recentsLoading ? (
                                <div className="space-y-1.5">
                                  {[...Array(3)].map((_, i) => (
                                    <div key={i} className="w-full p-2.5 bg-gray-50/50 border border-gray-100 rounded-xl flex items-center justify-between animate-pulse">
                                      <div className="flex-grow space-y-1.5 min-w-0">
                                        <div className="h-3 bg-gray-200 rounded w-1/3" />
                                        <div className="h-2 bg-gray-150 rounded w-1/2" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : recents.length === 0 ? (
                                <p className="text-[10px] text-gray-400 font-semibold text-center py-4">No recent recipients found.</p>
                              ) : (
                                <>
                                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
                                    {recents.slice(0, recentsLimit).map((rec, i) => (
                                      <button
                                        key={rec.id || i}
                                        type="button"
                                        onClick={() => handleSelectRecipient(rec)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-150 hover:border-[#FC7A00] rounded-xl flex items-center justify-between text-left transition-all cursor-pointer"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="font-hanken text-[11px] font-bold text-black truncate">{rec.accountName}</p>
                                          <p className="font-hanken text-[9px] text-gray-400 font-semibold">{rec.accountNumber} • {rec.bankName}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-gray-400 text-xs">chevron_right</span>
                                      </button>
                                    ))}
                                  </div>
                                  {recents.length > recentsLimit && (
                                    <button
                                      type="button"
                                      onClick={() => setRecentsLimit((limit) => limit + 5)}
                                      className="w-full text-center text-[10px] font-black text-[#FC7A00] uppercase hover:underline py-1.5 cursor-pointer"
                                    >
                                      See More Recipients
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {recentsLoading ? (
                                <div className="space-y-1.5">
                                  {[...Array(3)].map((_, i) => (
                                    <div key={i} className="w-full p-2.5 bg-gray-50/50 border border-gray-100 rounded-xl flex items-center justify-between animate-pulse">
                                      <div className="flex-grow space-y-1.5 min-w-0">
                                        <div className="h-3 bg-gray-200 rounded w-1/3" />
                                        <div className="h-2 bg-gray-150 rounded w-1/2" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : beneficiaries.length === 0 ? (
                                <p className="text-[10px] text-gray-400 font-semibold text-center py-4">No saved beneficiaries found.</p>
                              ) : (
                                <>
                                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
                                    {beneficiaries.slice(0, beneficiariesLimit).map((ben, i) => (
                                      <button
                                        key={ben.id || i}
                                        type="button"
                                        onClick={() => handleSelectRecipient(ben)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-150 hover:border-[#FC7A00] rounded-xl flex items-center justify-between text-left transition-all cursor-pointer"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="font-hanken text-[11px] font-bold text-black truncate">{ben.accountName}</p>
                                          <p className="font-hanken text-[9px] text-gray-400 font-semibold">{ben.accountNumber} • {ben.bankName}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-gray-400 text-xs">chevron_right</span>
                                      </button>
                                    ))}
                                  </div>
                                  {beneficiaries.length > beneficiariesLimit && (
                                    <button
                                      type="button"
                                      onClick={() => setBeneficiariesLimit((limit) => limit + 5)}
                                      className="w-full text-center text-[10px] font-black text-[#FC7A00] uppercase hover:underline py-1.5 cursor-pointer"
                                    >
                                      See More Beneficiaries
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display Detected Bank after successful automatic discovery or manual selection */}
                      {trfBank && trfAccountName && (
                        <div className="p-3.5 bg-gray-50 border border-gray-150 rounded-2xl flex items-center justify-between text-left animate-fade-in">
                          <div className="flex items-center gap-3">
                            <BankLogo name={trfBank.name} code={trfBank.code} logoUrl={trfBank.logoUrl} logoBackupUrl={(trfBank as any).logoBackupUrl} />
                            <div>
                              <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Detected Bank</span>
                              <p className="font-hanken text-xs font-extrabold text-black uppercase mt-0.5">{trfBank.name}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const activeAccount = isBulkMode ? bulkAccount : trfAccount;
                              if (!activeAccount || activeAccount.length !== 10) {
                                toast.error("Please enter a valid 10-digit account number first.");
                                return;
                              }
                              setIsManualFallback(true);
                              setTrfAccountName("");
                              setBankSearchQuery("");
                              setShowTrfBankSelector(true);
                            }}
                            className="text-[10px] font-black text-[#FC7A00] uppercase hover:underline"
                          >
                            Change Bank
                          </button>
                        </div>
                      )}



                      {/* Resolving Account Loading State Indicator (TASK 5) */}
                      {isResolvingAccount && (
                        <div className="flex items-center gap-2.5 p-4 bg-orange-50 border border-orange-100 rounded-2xl animate-pulse">
                          <span className="material-symbols-outlined text-primary text-[18px] animate-spin">progress_activity</span>
                          <span className="font-hanken text-xs font-black text-primary-dark">Verifying account holder identity...</span>
                        </div>
                      )}

                      {/* Manual Verify Recipient Button (Visible only when details entered but not verified yet - TASK 1) */}
                      {trfBank && trfAccount.length === 10 && !trfAccountName && !isResolvingAccount && (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={resolveAccountManually}
                          className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                          <span className="material-symbols-outlined text-[16px] font-black">check_circle</span>
                          Verify Recipient
                        </motion.button>
                      )}

                      {/* Verified Account Name & Green Verified Indicator (TASK 1) */}
                      {trfAccountName && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-left space-y-1 animate-fade-in"
                        >
                          <span className="text-[8px] font-black uppercase text-emerald-600 tracking-wider">Verified Account Holder</span>
                          <div className="flex items-center justify-between">
                            <span className="font-hanken text-sm font-black text-emerald-800 uppercase select-all truncate max-w-[250px]">
                              {trfAccountName}
                            </span>
                            <span className="font-hanken text-[11px] text-emerald-600 font-extrabold flex items-center gap-0.5 flex-shrink-0 select-none">
                              Verified ✅
                            </span>
                          </div>
                        </motion.div>
                      )}

                      {/* Amount and Narration Fields (Only enabled/visible after account is successfully verified - TASK 1) */}
                      {trfAccountName && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-4 pt-1"
                        >
                          {/* Transfer Amount Field */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Amount to Send (NGN)</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-lg text-gray-500">₦</span>
                              <input
                                type="number"
                                placeholder="0.00"
                                value={trfAmount}
                                onChange={(e) => {
                                  setTrfAmount(e.target.value);
                                }}
                                className="w-full bg-white border border-black rounded-2xl pl-10 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                              />
                            </div>
                          </div>

                          {/* Narration Field (Optional) */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Narration / Description (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. Rent, Payment for items, Food"
                              value={trfNarration}
                              onChange={(e) => setTrfNarration(e.target.value)}
                              className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                            />
                          </div>

                          {/* Live Transfer Fee and Cumulative Total Breakdown */}
                          {parseFloat(trfAmount) > 0 && (() => {
                            const activeMinTransfer = Number(config.minTransferAmount ?? (config as any).globalMinTransferAmount) || 100;
                            const amt = parseFloat(trfAmount) || 0;
                            const isBelowMin = amt < activeMinTransfer;

                            const currentTierName = String(userData?.tier || (userData?.kycStatus === "VERIFIED" ? "Tier 2" : "Tier 1"));
                            const hasCustomLimits = userData?.hasCustomLimits === true;

                            const userSingleCap = (hasCustomLimits && Number(userData?.maxSingleTransferLimit) > 0)
                              ? Number(userData.maxSingleTransferLimit)
                              : (currentTierName === "Tier 3"
                                  ? (config?.tier3SingleTransferLimit ?? config?.tier3SingleLimit ?? 10000000)
                                  : currentTierName === "Tier 2"
                                  ? (config?.tier2SingleTransferLimit ?? config?.tier2SingleLimit ?? 2000000)
                                  : (config?.tier1SingleTransferLimit ?? 200000));

                            const isExceedingSingleLimit = !userData?.unlimitedTransfers && userSingleCap > 0 && amt > userSingleCap;

                            return (
                              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-150 space-y-2 font-hanken text-xs">
                                <div className="flex justify-between text-gray-500">
                                  <span className="font-semibold">Transfer Principal</span>
                                  <span className="font-mono font-bold text-black">₦{amt.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-gray-500 border-b border-gray-200/50 pb-2">
                                  <span className="font-semibold">Transfer Fee</span>
                                  {isFeeLoading ? (
                                    <span className="material-symbols-outlined text-[14px] animate-spin text-[#FC7A00]">progress_activity</span>
                                  ) : (
                                    <span className="font-mono font-bold text-black">₦{trfFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                                  )}
                                </div>
                                <div className="flex justify-between items-center text-sm font-black pt-1">
                                  <span>Total Debit Amount</span>
                                  {isFeeLoading ? (
                                    <span className="material-symbols-outlined text-[14px] animate-spin text-[#FC7A00]">progress_activity</span>
                                  ) : (
                                    <span className="font-mono text-emerald-600 font-black">₦{trfTotalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                                  )}
                                </div>

                                {isBelowMin && (
                                  <p className="text-[9px] text-[#E11D48] font-bold uppercase leading-none pt-1">
                                    ⚠️ Minimum required transfer limit is ₦{activeMinTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </p>
                                )}

                                {isExceedingSingleLimit && (
                                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-left">
                                    <p className="text-[10px] font-extrabold text-amber-900 leading-snug">
                                      ⚠️ Transfer amount of ₦{amt.toLocaleString()} exceeds your {currentTierName} single transaction limit of ₦{userSingleCap.toLocaleString()}.
                                    </p>
                                    <div className="flex gap-2 pt-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          triggerHaptic();
                                          setIsTransferOpen(false);
                                          setIsTierUpgradeOpen(true);
                                        }}
                                        className="px-2.5 py-1 bg-[#FC7A00] text-white text-[9.5px] font-black uppercase tracking-wider rounded-lg shadow-2xs hover:brightness-105 active:scale-95 cursor-pointer"
                                      >
                                        Upgrade Tier
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          triggerHaptic();
                                          setIsTransferOpen(false);
                                          router.push("/support");
                                        }}
                                        className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 text-[9.5px] font-black uppercase tracking-wider rounded-lg active:scale-95 cursor-pointer"
                                      >
                                        Contact Support
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {(() => {
                                  const debt = Number(userData?.outstandingDebt) || 0;
                                  const spendable = Math.max(0, balance - debt);
                                  if (trfTotalDebit > spendable && !isBelowMin) {
                                    return (
                                      <p className="text-[9px] text-red-500 font-bold uppercase leading-none pt-1">
                                        ⚠️ Total debit exceeds spendable balance of ₦{spendable.toLocaleString()} (Outstanding Debt: ₦{debt.toLocaleString()})
                                      </p>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            );
                          })()}
                        </motion.div>
                      )}

                    </div>
                  ) : (
                    // --- BULK BATCH RECIPIENT ADDER FORM ---
                    <div className="space-y-4 flex-1">
                      <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Add Recipient to Batch</p>

                        {/* Bank selector (Reuses the elegant Select Bank Drawer Overlay) */}
                        <button
                          type="button"
                          onClick={handleOpenBankSelector}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-left font-hanken text-xs font-bold text-black flex items-center justify-between cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0 truncate">
                            {bulkBank ? (
                              <>
                                <BankLogo name={bulkBank.name} code={bulkBank.code || bulkBank.id} logoUrl={bulkBank.logoUrl} logoBackupUrl={(bulkBank as any).logoBackupUrl} />
                                <span className="truncate">{bulkBank.name}</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-gray-400 text-[18px]">account_balance</span>
                                <span>Choose bank...</span>
                              </>
                            )}
                          </span>
                          <span className="material-symbols-outlined text-gray-400 text-[16px]">expand_more</span>
                        </button>

                        {/* Account number */}
                        <input
                          type="number"
                          placeholder="Recipient Account Number (10 Digits)"
                          value={bulkAccount}
                          onChange={(e) => {
                            setBulkAccount(e.target.value.slice(0, 10));
                            if (e.target.value.length !== 10) {
                              setBulkName(""); // reset on edit
                            }
                          }}
                          className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                        />

                        {/* Find Bank button for Bulk */}
                        {bulkAccount.length === 10 && !bulkName && (
                          <button
                            type="button"
                            onClick={handleOpenBankSelector}
                            className="w-full py-2.5 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white text-xs font-bold uppercase tracking-wider rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">search</span>
                            Find Bank
                          </button>
                        )}

                        {isBulkResolving && (
                          <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl animate-pulse text-left">
                            <span className="material-symbols-outlined text-blue-500 text-[14px] animate-spin">progress_activity</span>
                            <span className="font-hanken text-[10px] font-bold text-blue-600">Verifying bank account details...</span>
                          </div>
                        )}

                        {!isBulkResolving && bulkName && (
                          <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex flex-col text-left">
                            <p className="text-[7px] font-black uppercase text-emerald-600 tracking-wider">Recipient Name</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-4.5 h-4.5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0 animate-pulse">
                                <span className="material-symbols-outlined text-[10px] font-black">check_circle</span>
                              </div>
                              <span className="font-hanken text-[11px] font-extrabold text-emerald-700 uppercase truncate leading-none">
                                {bulkName}
                              </span>
                            </div>
                            {/* Red Warning text below verified name */}
                            <p className="text-[9px] font-bold text-[#E11D48] mt-1.5 flex items-center gap-1 font-hanken leading-none">
                              <span className="material-symbols-outlined text-[12px] text-[#E11D48] font-bold">warning</span>
                              You are sending funds to him/her
                            </p>
                          </div>
                        )}

                        {/* Amount - shown only after verified */}
                        {bulkName && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Recipient Amount (NGN)</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-lg text-gray-500">₦</span>
                              <input
                                type="number"
                                placeholder="Recipient Amount"
                                value={bulkAmountVal}
                                onChange={(e) => setBulkAmountVal(e.target.value)}
                                className="w-full bg-white border border-black rounded-2xl pl-10 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                              />
                            </div>
                          </div>
                        )}

                        {bulkName && (
                          <button
                            type="button"
                            onClick={handleAddBulkRecipient}
                            disabled={isBulkResolving || !bulkName || !bulkAmountVal}
                            className="w-full py-3 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-xl cursor-pointer hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[15px]">add_circle</span>
                            Add to Batch
                          </button>
                        )}
                      </div>

                      {/* Recipients array scroll list */}
                      <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Recipients Added ({bulkRecipients.length})</p>

                      <div className="max-h-[140px] overflow-y-auto border border-gray-150 rounded-2xl flex flex-col no-scrollbar">
                        {bulkRecipients.length === 0 ? (
                          <p className="py-8 text-center text-gray-400 font-hanken text-[10px] font-semibold">No recipients added yet.</p>
                        ) : (
                          bulkRecipients.map((rec, index) => (
                            <div
                              key={index}
                              className="px-4 py-3 hover:bg-[#FFF9F5] border-b border-gray-150 flex items-center justify-between font-hanken text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <BankLogo name={rec.bankName} code={rec.bankCode || rec.bankId} logoUrl={rec.logoUrl} logoBackupUrl={rec.logoBackupUrl} />
                                <div className="min-w-0">
                                  <p className="font-extrabold text-black uppercase leading-tight truncate max-w-[180px]">{rec.recipientName}</p>
                                  <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{rec.bankName} - {rec.accountNumber}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-black text-black">₦{rec.amount.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkRecipient(index)}
                                  className="w-6 h-6 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px]">delete</span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                    </div>
                  )}

                  {/* BANK SELECTION OVERLAY DRAWER - Outside condition so it can be triggered on both Single and Bulk modes */}
                  {/* BANK SELECTION OVERLAY DRAWER */}
                      <AnimatePresence>
                        {showTrfBankSelector && (
                          <>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setShowTrfBankSelector(false)}
                              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999998]"
                            />

                            <motion.div
                              initial={{ y: "100%" }}
                              animate={{ y: 0 }}
                              exit={{ y: "100%" }}
                              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
                              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] z-[999999] p-6 pb-8 shadow-none text-black h-[90vh] max-h-[90vh] flex flex-col no-scrollbar"
                            >
                              <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-5 mx-auto" />

                              <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                                <h3 className="font-hanken font-bold text-base text-black">Select Recipient Bank</h3>
                                <button
                                  type="button"
                                  onClick={() => setShowTrfBankSelector(false)}
                                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer transition-all"
                                >
                                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                                </button>
                              </div>

                              <div className="relative mb-4">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
                                <input
                                  type="text"
                                  placeholder="Search bank name (e.g. GTBank, Opay)..."
                                  value={bankSearchQuery}
                                  onChange={(e) => setBankSearchQuery(e.target.value)}
                                  className="w-full bg-white border border-black rounded-2xl pl-10 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                                />
                              </div>

                              {/* Loading Banks State (TASK 5) */}
                              {isBanksLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                  <span className="material-symbols-outlined text-[32px] animate-spin mb-2 text-[#FC7A00]">progress_activity</span>
                                  <p className="font-hanken text-xs font-semibold">Loading banks directory...</p>
                                </div>
                              ) : (
                                <div className="flex-1 overflow-y-auto space-y-2.5 px-1 pr-1.5 pt-2.5 pb-16 custom-scrollbar min-h-0">
                                  {filteredTrfBanks.map((bank) => {
                                    return (
                                      <button
                                        key={bank.id}
                                        type="button"
                                        onClick={() => {
                                          if (isBulkMode) {
                                            setBulkBank(bank);
                                          } else {
                                            setTrfBank(bank);
                                            setTrfAccountName(""); // Reset name to force re-verification
                                          }
                                          setShowTrfBankSelector(false);
                                        }}
                                        className="w-full p-3.5 rounded-2xl bg-white flex items-center gap-3.5 transition-all duration-300 text-left cursor-pointer shadow-none premium-gradient-border"
                                      >
                                        <BankLogo name={bank.name} code={bank.code} logoUrl={bank.logoUrl} logoBackupUrl={(bank as any).logoBackupUrl} />
                                        <div className="min-w-0 flex-1">
                                          <p className="font-hanken text-[12px] font-black text-black leading-tight truncate">{bank.name}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-gray-400 text-sm">chevron_right</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>

                  {/* Bottom Slide Menu Banner */}
                  {config.bannerTransferPosition === "bottom" && (
                    <div className="mt-4 flex-shrink-0">
                      <BannerSlideshow page="transfer" />
                    </div>
                  )}
                </motion.div>
              )}

              {/* STAGE 2: Secure Payment Confirmation Screen (TASK 6) */}
              {trfStep === "confirm" && (
                <motion.div
                  key="trf-confirm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 text-left flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-4 overflow-y-auto pr-1 no-scrollbar pb-2">
                    <div className="text-center space-y-1">
                      <div className="w-12 h-12 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center text-primary mx-auto">
                        <span className="material-symbols-outlined text-[24px] font-black">gpp_maybe</span>
                      </div>
                      <h4 className="font-hanken font-extrabold text-base text-black mt-2">Confirm Outward Transfer</h4>
                      <p className="font-hanken text-[11px] font-semibold text-red-500">Please review all settlement parameters before final signing.</p>
                    </div>

                    {/* Bold structured Summary details (TASK 6) */}
                    <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-5 space-y-3 font-hanken">
                      <div className="grid grid-cols-2 gap-2 border-b border-gray-200/50 pb-2">
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Recipient Name</span>
                          <p className="font-hanken text-xs font-black text-black uppercase mt-0.5 select-all truncate leading-tight">
                            {isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Destination Bank</span>
                          <p className="font-hanken text-xs font-extrabold text-gray-800 uppercase mt-0.5 truncate leading-tight">
                            {isBulkMode ? "Multiple Banks" : trfBank?.name}
                          </p>
                        </div>
                      </div>

                      {!isBulkMode && (
                        <div className="border-b border-gray-200/50 pb-2">
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Recipient Account Number</span>
                          <p className="font-mono text-xs font-black text-black mt-0.5 select-all tracking-widest leading-none">
                            {trfAccount}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 border-b border-gray-200/50 pb-2">
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Principal Amount</span>
                          <p className="font-mono text-sm font-black text-emerald-600 mt-0.5 leading-none">
                            ₦{parseFloat(trfAmount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Transfer Fee</span>
                          <p className="font-mono text-sm font-black text-gray-700 mt-0.5 leading-none">
                            ₦{trfFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      <div className="border-b border-gray-200/50 pb-2">
                        <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Narration Note</span>
                        <p className="font-hanken text-xs font-semibold text-gray-800 mt-0.5 leading-tight italic truncate">
                          &quot;{trfNarration || `Transfer To ${trfAccountName}`}&quot;
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">My Wallet Balance</span>
                          <p className="font-mono text-xs font-bold text-gray-600 mt-0.5 leading-none">
                            ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Total Debit Deduction</span>
                          <p className="font-mono text-base font-black text-[#E11D48] mt-0.5 leading-none">
                            ₦{trfTotalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/80 rounded-2xl flex items-center gap-3 shadow-2xs">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-300/40 flex items-center justify-center text-amber-600 shrink-0">
                        <span className="material-symbols-outlined text-[18px] font-black">lock</span>
                      </div>
                      <p className="font-hanken text-[11.5px] font-medium text-amber-950 leading-snug">
                        To authorize this transaction, your secure <span className="font-extrabold text-amber-900">4-digit transaction PIN</span> will be requested on the next screen.
                      </p>
                    </div>

                  </div>

                </motion.div>
              )}

              {/* STAGE 2.5: Integrated Authorize Transfer Screen */}
              {trfStep === "pin" && (
                <motion.div
                  key="trf-pin"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 flex-1 flex flex-col justify-between items-center text-center w-full max-w-md mx-auto"
                >
                  {isTrf2faStage ? (
                    <TwoFactorOtpVerificationView
                      user={user}
                      title="2FA Transfer Verification"
                      description={`PIN/Biometrics verified! Complete 2FA OTP verification to authorize ₦${trfTotalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })} transfer.`}
                      onVerifiedSuccess={() => executeOutwardTransfer(trfVerifiedPin || undefined, !trfVerifiedPin)}
                      onCancel={() => {
                        setIsTrf2faStage(false);
                        setTrfPin("");
                      }}
                    />
                  ) : (
                    <>
                      <div className="space-y-3 w-full">
                        <div className="text-center space-y-1">
                          <div className="w-10 h-10 bg-orange-50 border border-orange-100 rounded-full flex items-center justify-center text-[#FC7A00] mx-auto shrink-0">
                            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>lock</span>
                          </div>
                          <h4 className="font-hanken font-extrabold text-sm text-black">Enter Transaction PIN</h4>
                          <p className="font-hanken text-[11px] text-gray-500 font-medium">Enter your 4-digit PIN or use biometrics to authorize transfer.</p>
                        </div>

                        {/* Displaying concise transfer summary card */}
                        <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-3.5 space-y-2 font-hanken text-left text-xs shadow-xs">
                          <div className="flex justify-between items-center font-semibold text-gray-600">
                            <span>Transfer Amount:</span>
                            <span className="font-mono font-bold text-gray-900">
                              ₦{(parseFloat(trfAmount) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                            <span className="text-gray-500 font-semibold">Transfer Fee:</span>
                            <span className="font-mono font-bold text-gray-700">
                              {trfFee > 0 ? `₦${trfFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦0.00 (Free)"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 font-bold text-gray-800">
                            <span>Total Debit Amount:</span>
                            <span className="font-mono font-black text-[#E11D48] text-sm">
                              ₦{trfTotalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                            <span className="text-gray-500 font-semibold">Recipient:</span>
                            <span className="font-extrabold text-black uppercase truncate max-w-[180px]">
                              {isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName}
                            </span>
                          </div>

                          {!isBulkMode && trfBank && (
                            <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                              <span className="text-gray-500 font-semibold">Destination Bank:</span>
                              <span className="font-semibold text-gray-800 uppercase truncate max-w-[180px]">
                                {trfBank.name} ({trfAccount})
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                            <span className="text-gray-500 font-semibold">My Wallet Balance:</span>
                            <span className="font-mono font-black text-black">
                              ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* 4 Box PIN Indicators */}
                        <div className="space-y-1 text-center py-1">
                          <div className="flex justify-center gap-2">
                            {[0, 1, 2, 3].map((idx) => (
                              <div
                                key={idx}
                                className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black transition-all ${
                                  trfPin.length > idx
                                    ? "border-[#FC7A00] bg-orange-50/40 text-black"
                                    : "border-gray-200 bg-white"
                                }`}
                              >
                                {trfPin[idx] ? "•" : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Keypad Grid */}
                      <div className="grid grid-cols-3 gap-2 pt-1 w-full max-w-xs mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleTrfPinPress(num.toString())}
                            className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                          >
                            {num}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { triggerHaptic(); setTrfPin(""); }}
                          className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 cursor-pointer active:scale-95 transition-all"
                        >
                          CLEAR
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTrfPinPress("0")}
                          className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={handleTrfPinDelete}
                          className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-gray-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[20px]">backspace</span>
                        </button>
                      </div>

                      {/* Action buttons */}
                      <div className="w-full max-w-xs mx-auto pt-1 pb-2 space-y-2">
                        {(userData?.isBiometricTransferEnabled === true || userData?.isBiometricLoginEnabled === true || userData?.isFaceIdEnabled === true) && (
                          <button
                            type="button"
                            onClick={handleBiometricTransferAuth}
                            className="w-full py-3 bg-[#07B038] hover:bg-[#058a2f] text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 border-0"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {getBiometricType() === "faceid" ? "face_6" : "fingerprint"}
                            </span>
                            <span>Authorize via {getBiometricLabel()}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={trfPin.length < 4}
                          onClick={() => {
                            if (trfPin.length === 4) {
                              if (userData?.is2faOtpEnabled === true) {
                                setTrfVerifiedPin(trfPin);
                                setIsTrf2faStage(true);
                              } else {
                                executeOutwardTransfer(trfPin);
                              }
                            }
                          }}
                          className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] disabled:from-gray-300 disabled:to-gray-400 text-white text-xs font-black uppercase tracking-widest rounded-xl cursor-pointer shadow-sm transition-all active:scale-98 border-0 flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">lock</span>
                          <span>PAY NOW</span>
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* STAGE 3: Bank Transfer Success Screen */}
              {trfStep === "completion" && transferResult && (
                <motion.div
                  key="trf-completion"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 text-center flex flex-col items-center py-2 flex-1 justify-between font-hanken"
                >
                  <div className="space-y-4 w-full overflow-y-auto no-scrollbar pr-1 pb-2">
                    {/* Pulsing visual animated check indicator badge */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto shadow-inner"
                    >
                      <span className="material-symbols-outlined text-[36px] font-black" style={{ fontVariationSettings: '"FILL" 1' }}>
                        check_circle
                      </span>
                    </motion.div>

                    <div>
                      <h4 className="font-hanken font-black text-lg text-gray-900 leading-tight">
                        Transfer Successful!
                      </h4>
                      <p className="font-hanken text-xs text-gray-500 mt-1 font-semibold leading-relaxed max-w-[280px] mx-auto">
                        Your outward bank transfer has been successfully initiated.
                      </p>
                    </div>

                    {/* Detailed structured summary breakdown */}
                    <div className="w-full bg-gray-50 rounded-2xl p-4 border border-gray-200/80 space-y-2.5 text-left font-hanken text-xs shadow-2xs">
                      <div className="flex justify-between items-center text-gray-500 border-b border-gray-200/50 pb-2">
                        <span>Recipient</span>
                        <span className="font-extrabold text-black uppercase truncate max-w-[180px]">
                          {isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName}
                        </span>
                      </div>

                      {!isBulkMode && trfBank && (
                        <div className="flex justify-between items-center text-gray-500 border-b border-gray-200/50 pb-2">
                          <span>Destination Bank</span>
                          <span className="font-semibold text-gray-800 uppercase truncate max-w-[180px]">
                            {trfBank.name} ({trfAccount})
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-500 border-b border-gray-200/50 pb-2">
                        <span>Transfer Amount</span>
                        <span className="font-mono font-bold text-gray-900">
                          ₦{(parseFloat(trfAmount) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-gray-500 border-b border-gray-200/50 pb-2">
                        <span>Transfer Fee</span>
                        <span className="font-mono font-bold text-gray-700">
                          {trfFee > 0 ? `₦${trfFee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦0.00 (Free)"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-b border-gray-200/50 pb-2 font-bold text-gray-800">
                        <span>Amount Debited</span>
                        <span className="font-mono font-black text-emerald-600 text-sm">
                          ₦{trfTotalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-gray-500 border-b border-gray-200/50 pb-2">
                        <span>Reference Code</span>
                        <span className="font-mono font-bold text-black select-all">
                          {transferResult.reference || "N/A"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-gray-500">
                        <span>Settlement Date</span>
                        <span className="font-bold text-black">{new Date().toLocaleString()}</span>
                      </div>

                      <p className="text-[10px] text-gray-400 leading-relaxed font-medium pt-1 text-center border-t border-gray-200/40">
                        Funds are usually settled instantly. You can check your transaction history ledger any time.
                      </p>
                    </div>
                  </div>

                  {/* Completion Action Buttons */}
                  <div className="w-full space-y-2 flex-shrink-0 pt-2 select-none">
                    {/* Row 1: View Receipt & Share Receipt */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleViewReceipt}
                        className="py-3 bg-gray-50 hover:bg-orange-50/50 border border-gray-200 hover:border-[#FC7A00]/40 text-black text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">receipt_long</span>
                        <span>View Receipt</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleShareReceiptClick}
                        className="py-3 bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[18px] text-emerald-600">share</span>
                        <span>Share Receipt</span>
                      </button>
                    </div>

                    {/* Row 2: Save Beneficiary Button */}
                    <button
                      type="button"
                      disabled={isBeneficiarySaved}
                      onClick={handleSaveBeneficiaryAction}
                      className={cn(
                        "w-full py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 border shadow-2xs",
                        isBeneficiarySaved
                          ? "bg-gray-100 text-gray-500 border-gray-200 cursor-default"
                          : "bg-orange-50 hover:bg-orange-100/80 border-orange-200 text-[#FC7A00] cursor-pointer active:scale-98"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isBeneficiarySaved ? "check_circle" : "person_add"}
                      </span>
                      <span>{isBeneficiarySaved ? "Saved to Beneficiaries" : "Save Beneficiary"}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            )}
            </div>
            </div>

            {/* Static Bottom Action Bar for Transfer Steps */}
            {isTrfContentReady && (trfStep === "input" || trfStep === "confirm" || trfStep === "completion") && (
              <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 shadow-lg z-20">
                {trfStep === "completion" ? (
                  <button
                    type="button"
                    onClick={handleCloseTransferModal}
                    className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all shadow-sm border-0"
                  >
                    Done
                  </button>
                ) : trfStep === "input" ? (
                  !isBulkMode ? (
                    trfAccountName ? (
                      (() => {
                        const activeMinTransfer = Number(config.minTransferAmount ?? (config as any).globalMinTransferAmount) || 100;
                        const amt = parseFloat(trfAmount) || 0;
                        const isInvalidAmount = !trfAmount || isNaN(amt) || amt < activeMinTransfer;

                        return (
                          <button
                            type="button"
                            disabled={isInvalidAmount || trfTotalDebit > balance || isFeeLoading}
                            onClick={() => setTrfStep("confirm")}
                            className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 border-0 shadow-sm"
                          >
                            Continue
                          </button>
                        );
                      })()
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full py-4 bg-gray-200 text-gray-400 text-xs font-black uppercase tracking-widest rounded-2xl border-0"
                      >
                        Enter Account Details
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTrfStep("confirm")}
                      disabled={bulkRecipients.length === 0}
                      className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all disabled:opacity-50 border-0 shadow-sm"
                    >
                      Confirm Batch Details
                    </button>
                  )
                ) : trfStep === "confirm" ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setIsTrfPinModalOpen(true);
                    }}
                    className="w-full py-4 bg-black hover:bg-black/90 text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 border-0 relative z-30"
                  >
                    <span>Authorize Transaction</span>
                    <span className="material-symbols-outlined text-[16px] font-black">lock</span>
                  </button>
                ) : null}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* USD Virtual Funding Instructions Modal */}
    <AnimatePresence>
      {isUsdFundingOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsUsdFundingOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] z-[99999] p-6 pb-8 shadow-none text-black overflow-y-auto max-h-[85vh] no-scrollbar"
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-5 mx-auto" />

            <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
              <h3 className="font-hanken font-bold text-base text-black">Fund USD Wallet</h3>
              <button
                type="button"
                onClick={() => setIsUsdFundingOpen(false)}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800">
                <p className="font-hanken font-bold text-xs">Direct USD Inbound Funding</p>
                <p className="font-hanken text-[10.5px] leading-relaxed mt-1 text-orange-700">
                  Fund your USD wallet by initiating a local SWIFT or domestic ACH/wire transfer to the virtual bank account details below. Settlement is credited automatically within minutes of confirmation.
                </p>
              </div>

              {usdAccountData ? (
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 space-y-3.5 relative overflow-hidden">
                  <div className="flex justify-between items-center pb-2 border-b border-white/10">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">USD RECEIVING ACCOUNT</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded">ACTIVE</span>
                  </div>

                  <div className="space-y-3 font-hanken text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Bank Name</span>
                      <span className="font-extrabold text-white">{usdAccountData.bankName}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Account Number</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-white tracking-wider select-all">{usdAccountData.accountNumber}</span>
                        <button
                          onClick={() => copyToClipboard(usdAccountData.accountNumber, "Account number")}
                          className="material-symbols-outlined text-gray-400 hover:text-white text-[16px]"
                        >
                          content_copy
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Routing Number</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-white tracking-wider select-all">{usdAccountData.routingNumber}</span>
                        <button
                          onClick={() => copyToClipboard(usdAccountData.routingNumber, "Routing number")}
                          className="material-symbols-outlined text-gray-400 hover:text-white text-[16px]"
                        >
                          content_copy
                        </button>
                      </div>
                    </div>

                    {usdAccountData.swiftCode && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">SWIFT / BIC</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white tracking-wider select-all">{usdAccountData.swiftCode}</span>
                          <button
                            onClick={() => copyToClipboard(usdAccountData.swiftCode || "", "SWIFT code")}
                            className="material-symbols-outlined text-gray-400 hover:text-white text-[16px]"
                          >
                            content_copy
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-gray-400">Beneficiary Name</span>
                      <span className="font-bold text-white truncate max-w-[200px]">{resolvedName}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-gray-400 flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined text-[32px] animate-spin mb-2 text-[#FC7A00]">progress_activity</span>
                  <p className="font-hanken text-xs font-semibold">Generating your custom USD account...</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsUsdFundingOpen(false);
                  setIsSwapOpen(true);
                }}
                className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                Fund Using NGN Wallet Instead
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Full-Screen Multi-Currency Swap Modal */}
    <AnimatePresence>
      {isSwapOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
          className="fixed inset-0 bg-white z-[100000] flex flex-col justify-between overflow-hidden text-black font-hanken will-change-transform"
        >
          {/* Top Header */}
          <div className="w-full px-5 py-4 border-b border-gray-200/80 flex items-center justify-between bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              {swapStep === "pin" && (
                <button
                  type="button"
                  onClick={() => setSwapStep("form")}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:text-black cursor-pointer active:scale-95 transition-all"
                  title="Back to Swap Form"
                >
                  <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
                </button>
              )}
              <div>
                <h3 className="font-extrabold text-base text-black leading-tight">
                  {swapStep === "pin" ? "Authorize PIN" : "Currency Swap"}
                </h3>
                <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                  {swapStep === "pin" ? "Confirm details to complete swap" : `${swapFromCurrency} → ${swapToCurrency}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSwapOpen(false)}
              className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px] font-bold">close</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto px-5 py-6 pb-16 max-w-md mx-auto w-full no-scrollbar space-y-5">
            {!isFeatureEnabled(config?.featureToggles, "currency_swap") ? (
              <div className="py-8">
                <FeatureDisabledBanner
                  title="Currency Swap Unavailable"
                  message={getFeatureDisabledMessage(config?.featureToggles, "currency_swap")}
                />
              </div>
            ) : swapStep === "form" ? (
              <form id="currency-swap-form" onSubmit={handleSwapFormContinue} className="space-y-5 text-left">
                {/* Dynamic Swap Direction & Currency pill selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Swap To Currency</label>
                    <button
                      type="button"
                      onClick={() => {
                        const prevFrom = swapFromCurrency;
                        const prevTo = swapToCurrency;
                        setSwapFromCurrency(prevTo);
                        setSwapToCurrency(prevFrom);
                      }}
                      className="text-[11px] font-extrabold text-[#FC7A00] flex items-center gap-1 hover:underline cursor-pointer bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-100"
                    >
                      <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                      Switch Direction
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {(["NGN", "USD", "XOF"] as const)
                      .filter((c) => c !== swapFromCurrency)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSwapToCurrency(c)}
                          className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all cursor-pointer border ${
                            swapToCurrency === c
                              ? "bg-[#FC7A00]/10 border-[#FC7A00] text-[#FC7A00] shadow-sm"
                              : "bg-gray-50 border-gray-200 text-gray-500 hover:text-black"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Available Balance in swapFromCurrency */}
                {(() => {
                  const avail = swapFromCurrency === "NGN" ? walletBalances.NGN : (swapFromCurrency === "USD" ? walletBalances.USD : walletBalances.XOF);
                  const symbol = swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ");
                  return (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 flex items-center justify-between shadow-xs">
                      <div>
                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Available Balance</p>
                        <p className="font-mono font-black text-black text-base mt-0.5">
                          {symbol}{avail.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <span className="text-[10px] bg-[#FC7A00]/10 text-[#FC7A00] font-black px-3 py-1 rounded-lg uppercase tracking-wider border border-[#FC7A00]/20">
                        {swapFromCurrency} WALLET
                      </span>
                    </div>
                  );
                })()}

                {/* Amount to Swap */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Amount to Swap</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-lg text-gray-500">
                      {swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ")}
                    </span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={swapAmount}
                      onChange={(e) => setSwapAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-gray-250 rounded-2xl pl-16 pr-4 py-4 text-sm font-black text-black placeholder-gray-300 outline-none focus:border-[#FC7A00] shadow-sm transition-all"
                    />
                  </div>
                </div>

                {/* Rates Loader & Breakdown Card */}
                {isRatesLoading ? (
                  <div className="flex items-center justify-center gap-2.5 p-4 bg-[#FFF9F5] border border-[#FFECD8] rounded-2xl text-xs font-bold text-[#FC7A00] animate-pulse">
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Fetching live exchange rate...</span>
                  </div>
                ) : (
                  swapRate !== null && (
                    <div className="bg-[#FFF9F5] border border-[#FFECD8] rounded-2xl p-4.5 space-y-3 text-xs shadow-xs">
                      <div className="flex justify-between items-center text-gray-600">
                        <span className="font-bold">Live Exchange Rate</span>
                        <div className="text-right">
                          <span className="font-mono font-black text-black text-xs block">
                            1 {swapFromCurrency} = {swapRate < 0.01 ? swapRate.toFixed(6) : swapRate.toFixed(4)} {swapToCurrency}
                          </span>
                          {swapRate > 0 && (
                            <span className="font-mono text-[10px] text-gray-400 font-extrabold block mt-0.5">
                              (1 {swapToCurrency} = {swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ")}
                              {(1 / swapRate) < 0.01
                                ? (1 / swapRate).toFixed(6)
                                : (1 / swapRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              )
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Explicit Total Amount Deducted Breakdown */}
                      <div className="flex justify-between text-gray-600 border-t border-gray-200/60 pt-2.5 items-center">
                        <span className="font-extrabold text-black">Total Amount Deducted:</span>
                        <span className="font-mono font-black text-amber-700 text-xs">
                          {swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ")}
                          {(parseFloat(swapAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {swapFromCurrency}
                        </span>
                      </div>

                      {swapFee > 0 && (
                        <div className="flex justify-between text-gray-500 border-t border-gray-200/60 pt-2 items-center">
                          <span className="font-semibold">Swap Fee / Commission Included:</span>
                          <span className="font-mono font-bold text-amber-600">
                            {swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ")}{swapFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Explicit Total Amount Credited Breakdown */}
                      <div className="flex justify-between text-gray-800 border-t border-gray-200/80 pt-2.5 items-center">
                        <span className="font-black text-black text-xs">Total Amount Credited:</span>
                        <span className="font-mono font-black text-emerald-600 text-sm">
                          {swapToCurrency === "NGN" ? "₦" : (swapToCurrency === "USD" ? "$" : "CFA ")}
                          {swapTargetAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {swapToCurrency}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </form>
            ) : (
              /* PIN Authorization Step */
              <div className="space-y-5 flex flex-col items-center text-center w-full max-w-md mx-auto">
                {isSwap2faStage ? (
                  <TwoFactorOtpVerificationView
                    user={user}
                    title="2FA Currency Swap Verification"
                    description={`PIN/Biometrics verified! Complete 2FA OTP verification to authorize currency swap from ${swapFromCurrency} to ${swapToCurrency}.`}
                    onVerifiedSuccess={() => handleSwapExecute()}
                    onCancel={() => {
                      setIsSwap2faStage(false);
                      setSwapPin("");
                    }}
                  />
                ) : (
                  <>
                <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4.5 space-y-3 font-hanken shadow-xs w-full text-left">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Swap Summary Breakdown</p>

                  <div className="flex justify-between text-xs font-bold text-gray-700">
                    <span>Total Amount Deducted:</span>
                    <span className="font-mono font-black text-amber-700">
                      {swapFromCurrency === "NGN" ? "₦" : (swapFromCurrency === "USD" ? "$" : "CFA ")}
                      {parseFloat(swapAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {swapFromCurrency}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs font-bold text-gray-700 border-t border-gray-200/60 pt-2">
                    <span>Total Amount Credited:</span>
                    <span className="font-mono font-black text-emerald-600">
                      {swapToCurrency === "NGN" ? "₦" : (swapToCurrency === "USD" ? "$" : "CFA ")}
                      {swapTargetAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {swapToCurrency}
                    </span>
                  </div>

                  {swapRate !== null && (
                    <div className="flex justify-between text-[11px] font-semibold text-gray-500 border-t border-gray-200/60 pt-2">
                      <span>Effective Rate:</span>
                      <span className="font-mono text-black font-extrabold">
                        1 {swapFromCurrency} = {swapRate < 0.01 ? swapRate.toFixed(6) : swapRate.toFixed(4)} {swapToCurrency}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-center py-2">
                  <label className="text-xs font-black text-black block">Enter 4-Digit Transaction PIN</label>
                  <p className="text-[11px] text-gray-500 font-medium">Authorizes debit of {swapFromCurrency} wallet to credit {swapToCurrency} wallet.</p>

                  <div className="flex justify-center gap-2 pt-2">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black transition-all ${
                          swapPin.length > idx
                            ? "border-[#FC7A00] bg-orange-50/40 text-black"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        {swapPin[idx] ? "•" : ""}
                      </div>
                    ))}
                  </div>

                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    value={swapPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setSwapPin(val);
                    }}
                    className="opacity-0 absolute -z-10"
                  />
                </div>

                {/* Custom Keypad for PIN input */}
                <div className="grid grid-cols-3 gap-2.5 pt-1 w-full max-w-xs mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        if (swapPin.length < 4) setSwapPin((prev) => prev + num);
                      }}
                      className="py-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSwapPin("")}
                    className="py-3.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 cursor-pointer active:scale-95 transition-all"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (swapPin.length < 4) setSwapPin((prev) => prev + "0");
                    }}
                    className="py-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwapPin((prev) => prev.slice(0, -1))}
                    className="py-3.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-gray-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">backspace</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (swapPin.length < 4) return;
                    if (userData?.is2faOtpEnabled === true) {
                      setSwapVerifiedPin(swapPin);
                      setIsSwap2faStage(true);
                    } else {
                      handleSwapExecute();
                    }
                  }}
                  disabled={isSwapping || swapPin.length < 4}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] disabled:from-gray-300 disabled:to-gray-400 text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2 shadow-sm"
                >
                  {isSwapping ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      Authorizing Swap...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">lock</span>
                      Confirm & Execute Swap
                    </>
                  )}
                </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Static Bottom Action Bar for Swap Form Step */}
          {swapStep === "form" && (
            <div className="p-5 bg-white border-t border-gray-100 max-w-md mx-auto w-full flex-shrink-0 shadow-lg z-20">
              {(() => {
                const avail = swapFromCurrency === "NGN" ? walletBalances.NGN : (swapFromCurrency === "USD" ? walletBalances.USD : walletBalances.XOF);
                const parsedAmt = parseFloat(swapAmount);
                const isExceeded = !isNaN(parsedAmt) && parsedAmt > avail;

                return (
                  <button
                    type="submit"
                    form="currency-swap-form"
                    disabled={isSwapping || isRatesLoading || !swapAmount || isNaN(parsedAmt) || parsedAmt <= 0 || isExceeded}
                    className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] disabled:from-gray-300 disabled:to-gray-400 text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-sm border-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                    {isExceeded ? "Insufficient Wallet Balance" : "Authorize Swap"}
                  </button>
                );
              })()}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>

    {/* Unified Global KYC Verification Drawer */}
    <KycVerificationDrawer
      isOpen={isKycDrawerOpen}
      onClose={() => setIsKycDrawerOpen(false)}
      onSuccess={() => setIsKycDrawerOpen(false)}
    />

    {/* Tier Upgrade Drawer Modal */}
    <TierUpgradeDrawerModal
      isOpen={isTierUpgradeOpen}
      onClose={() => setIsTierUpgradeOpen(false)}
      onRequestSubmitted={() => setIsTierUpgradeOpen(false)}
    />

    {/* Dedicated Authorize Transaction Modal */}
    <AuthorizeTransactionModal
      isOpen={isTrfPinModalOpen}
      recipientName={isBulkMode ? `${bulkRecipients.length} Batch Recipients` : trfAccountName}
      bankName={isBulkMode ? "Multiple Banks" : trfBank?.name || "Bank"}
      accountNumber={isBulkMode ? "Multiple" : trfAccount}
      amount={parseFloat(trfAmount) || 0}
      fee={trfFee}
      totalDebit={trfTotalDebit}
      walletBalance={balance}
      remainingFreeTransfers={(trfFeeData as any)?.remainingFreeTransfers}
      showFreeIndicator={(trfFeeData as any)?.showFreeIndicator !== false}
      onClose={() => setIsTrfPinModalOpen(false)}
      onExecuteTransfer={(pin, isBiometric) => {
        setIsTrfPinModalOpen(false);
        executeOutwardTransfer(pin, isBiometric);
      }}
    />

    {/* Full Detailed Transaction Receipt Modal */}
    {completedTxForReceipt && (
      <TransactionReceipt
        transaction={completedTxForReceipt}
        initialShowShareModal={openWithShareModal}
        onClose={() => {
          setCompletedTxForReceipt(null);
          setOpenWithShareModal(false);
        }}
      />
    )}

    </>
  );
};
