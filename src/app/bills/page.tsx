"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteGuard } from "@/components/RouteGuard";
import { Header } from "@/components/layout/Header";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import BannerSlideshow from "@/components/BannerSlideshow";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { AppLogo } from "@/components/AppLogo";
import {
  Biller,
  BillItem,
  BillsReceipt,
  WalletType,
  getBillsCache,
  setBillsCache,
  BillerSelectionCard,
  BillPlanSelectionCard,
  BillCheckoutModal,
  BillPinModal,
  BillSuccessReceipt,
} from "@/components/bills";

export default function GenericBillPage() {
  const { userData, user } = useAuth();
  const searchParams = useSearchParams();
  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const currentPhoto = (userData?.photoURL ||
    user?.photoURL ||
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  const [pagePreloading, setPagePreloading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPagePreloading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Wallet Balance sync
  const balance = Number(userData?.balance) || 0;
  const bonusBalance = Number(userData?.bonusBalance) || 0;

  // Selected Wallet Type
  const [walletTypeSelected, setWalletTypeSelected] = useState<WalletType>("MAIN");

  // Determine Category from URL query or default to AIRTIME
  const pageCategory = (
    (searchParams ? searchParams.get("type") : "AIRTIME") || "AIRTIME"
  ).toUpperCase();

  // Dynamic States
  const [billers, setBillers] = useState<Biller[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);

  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedItem, setSelectedItem] = useState<BillItem | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [validatedName, setValidatedName] = useState<string>("");

  // Loading States
  const [isBillersLoading, setIsBillersLoading] = useState<boolean>(false);
  const [isItemsLoading, setIsItemsLoading] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);

  // Checkout Modal State
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);

  // PIN Pad Modal States
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

  // Payment Success Screen States
  const [successReceipt, setSuccessReceipt] = useState<BillsReceipt | null>(null);

  // Mute background scrolling & intercept mobile hardware back button across bills drawers
  useModalBackHandler(isCheckoutModalOpen, () => setIsCheckoutModalOpen(false), "bills-checkout-modal");
  useModalBackHandler(isPinModalOpen, () => setIsPinModalOpen(false), "bills-pin-modal");
  useModalBackHandler(Boolean(successReceipt), () => setSuccessReceipt(null), "bills-receipt-modal");

  const getPageTitle = () => {
    switch (pageCategory) {
      case "AIRTIME":
        return "Buy Airtime";
      case "DATA":
        return "Buy Mobile Data";
      case "BETTING":
        return "Betting Account Funding";
      case "CABLE":
        return "Cable TV Bills";
      case "UTILITY":
        return "Electricity Utility Bills";
      case "INTERNET":
        return "Internet Subscriptions";
      case "WAEC":
        return "Buy WAEC PINs";
      default:
        return "Bill Payments";
    }
  };

  const getReviewModalTitle = () => {
    switch (pageCategory) {
      case "AIRTIME":
        return "Review Airtime Purchase";
      case "DATA":
        return "Review Data Purchase";
      case "UTILITY":
        return "Review Electricity Purchase";
      case "CABLE":
        return "Review Cable TV Subscription";
      case "WAEC":
        return "Review WAEC Scratch Card Purchase";
      default:
        return "Review Order Details";
    }
  };

  const getPageIcon = () => {
    switch (pageCategory) {
      case "AIRTIME":
        return "call";
      case "DATA":
        return "network_wifi";
      case "BETTING":
        return "sports_basketball";
      case "CABLE":
        return "tv";
      case "UTILITY":
        return "bolt";
      case "INTERNET":
        return "language";
      case "WAEC":
        return "school";
      default:
        return "payments";
    }
  };

  // Prevent background scrolling while pay bills PIN keypad modal is active
  useEffect(() => {
    if (isPinModalOpen || isCheckoutModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isPinModalOpen, isCheckoutModalOpen]);

  // Fetch billers and custom logo overrides when pageCategory changes (with 10-min cache)
  useEffect(() => {
    async function fetchBillers() {
      setIsBillersLoading(true);
      setSelectedBiller(null);
      setSelectedItem(null);
      setItems([]);
      setCustomerId("");
      setCustomAmount("");
      setValidatedName("");

      const cacheKey = `billers_${pageCategory}`;
      const cachedBillers = getBillsCache<Biller[]>(cacheKey);
      if (cachedBillers && Array.isArray(cachedBillers) && cachedBillers.length > 0) {
        setBillers(cachedBillers);
        setIsBillersLoading(false);
        return;
      }

      try {
        // Fetch custom bill logo overrides from backend
        let customLogos: Record<string, string> = {};
        try {
          const logosRes = await fetch("/api/bills/logos");
          const logosData = await logosRes.json();
          if (logosData.success && logosData.logos) {
            customLogos = logosData.logos;
          }
        } catch {
          console.warn("Custom bill logos fetch fallback.");
        }

        const isMock =
          typeof window !== "undefined" &&
          (sessionStorage.getItem("mock") === "true" ||
            window.location.search.includes("mock=true"));
        if (isMock) {
          let list: Biller[] = [];
          if (pageCategory === "AIRTIME" || pageCategory === "DATA") {
            list = [
              { id: 1, name: "MTN Network", biller_code: "mtn", logo: customLogos["mtn"] || "" },
              { id: 2, name: "GLO Network", biller_code: "glo", logo: customLogos["glo"] || "" },
              { id: 3, name: "AIRTEL Network", biller_code: "airtel", logo: customLogos["airtel"] || "" },
              { id: 4, name: "9MOBILE Network", biller_code: "9mobile", logo: customLogos["9mobile"] || "" },
            ];
          } else if (pageCategory === "UTILITY") {
            list = [
              { id: 1, name: "IKEDC Electricity", biller_code: "ikedc", logo: customLogos["ikedc"] || "" },
              { id: 2, name: "EKEDC Electricity", biller_code: "ekedc", logo: customLogos["ekedc"] || "" },
              { id: 3, name: "KEDCO Electricity", biller_code: "kedco", logo: customLogos["kedco"] || "" },
            ];
          } else if (pageCategory === "CABLE") {
            list = [
              { id: 1, name: "DStv", biller_code: "dstv", logo: customLogos["dstv"] || "" },
              { id: 2, name: "GOtv", biller_code: "gotv", logo: customLogos["gotv"] || "" },
              { id: 3, name: "StarTimes", biller_code: "startimes", logo: customLogos["startimes"] || "" },
            ];
          } else if (pageCategory === "WAEC") {
            list = [
              { id: 1, name: "WAEC Council", biller_code: "waec", logo: customLogos["waec"] || "" },
            ];
          }
          setBillers(list);
          setBillsCache(cacheKey, list);
          setIsBillersLoading(false);
          return;
        }

        let idToken = "mock-token";
        if (user) {
          try {
            idToken = await user.getIdToken();
          } catch (tokErr) {
            console.warn("Failed to get idToken:", tokErr);
          }
        }
        const authHeaders = { Authorization: `Bearer ${idToken}` };

        let finalBillersList: Biller[] = [];

        if (pageCategory === "AIRTIME" || pageCategory === "DATA") {
          const res = await fetch("/api/vtu/networks", { headers: authHeaders });
          if (!res.ok) throw new Error("Failed to load networks from gateway.");
          const data = await res.json();
          finalBillersList = (data.networks || []).map((name: string, index: number) => {
            const codeKey = name.toLowerCase();
            return {
              id: index + 1,
              name: `${name} Network`,
              biller_code: name,
              logo: customLogos[codeKey] || "",
            };
          });
        } else if (pageCategory === "UTILITY") {
          const companies = ["IKEDC", "EKEDC", "AEDC", "KEDCO", "PHED", "JED", "EEDC", "IBEDC", "KAEDCO"];
          finalBillersList = companies.map((name, index) => {
            const codeKey = name.toLowerCase();
            return {
              id: index + 1,
              name: `${name} Electricity`,
              biller_code: name,
              logo: customLogos[codeKey] || "",
            };
          });
        } else if (pageCategory === "CABLE") {
          const providers = ["DStv", "GOtv", "StarTimes"];
          finalBillersList = providers.map((name, index) => {
            const codeKey = name.toLowerCase();
            return {
              id: index + 1,
              name: name,
              biller_code: codeKey,
              logo: customLogos[codeKey] || "",
            };
          });
        } else if (pageCategory === "WAEC") {
          finalBillersList = [
            {
              id: 1,
              name: "WAEC Council",
              biller_code: "waec",
              logo: customLogos["waec"] || "",
            },
          ];
        } else {
          const apiCategory = pageCategory;
          const res = await fetch(`/api/bills/billers?category=${apiCategory}`);
          if (!res.ok) throw new Error("Failed to load billing providers.");
          const data = await res.json();
          finalBillersList = (data.data || []).map((b: Biller) => ({
            ...b,
            logo: customLogos[b.biller_code.toLowerCase()] || b.logo || "",
          }));
        }

        setBillers(finalBillersList);
        setBillsCache(cacheKey, finalBillersList);
      } catch (err: unknown) {
        const error = err as Error;
        console.error("Error fetching billers:", error.message);
        toast.error("Unable to load billing providers.");
      } finally {
        setIsBillersLoading(false);
      }
    }
    fetchBillers();
  }, [pageCategory, user]);

  // Fetch items/packages when selectedBiller changes (with 10-min cache)
  useEffect(() => {
    if (!selectedBiller) return;

    const currentBiller = selectedBiller;

    async function fetchItems() {
      setIsItemsLoading(true);
      setSelectedItem(null);
      setCustomerId("");
      setCustomAmount("");
      setValidatedName("");

      const cacheKey = `items_${pageCategory}_${currentBiller.biller_code}`;
      const cachedItems = getBillsCache<BillItem[]>(cacheKey);
      if (cachedItems && Array.isArray(cachedItems) && cachedItems.length > 0) {
        setItems(cachedItems);
        setIsItemsLoading(false);
        return;
      }

      try {
        const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
        if (isMock) {
          let list: BillItem[] = [];
          if (pageCategory === "DATA") {
            list = [
              { id: 1, biller_code: currentBiller.biller_code, name: "1 GB - 30 days (SME)", item_code: "sme_1gb", amount: 461, is_fixed_amount: true },
              { id: 2, biller_code: currentBiller.biller_code, name: "2 GB - 30 days (SME)", item_code: "sme_2gb", amount: 922, is_fixed_amount: true },
              { id: 3, biller_code: currentBiller.biller_code, name: "5 GB - 30 days (SME)", item_code: "sme_5gb", amount: 2306, is_fixed_amount: true },
              { id: 4, biller_code: currentBiller.biller_code, name: "125MB - 1 day (Awoof Data)", item_code: "awoof_125", amount: 97, is_fixed_amount: true },
              { id: 5, biller_code: currentBiller.biller_code, name: "2.5GB - Weekend Plan - [Sat & Sun]", item_code: "weekend_25", amount: 485, is_fixed_amount: true },
            ];
          } else if (pageCategory === "AIRTIME") {
            list = [
              { id: 1, biller_code: currentBiller.biller_code, name: `${currentBiller.name} Airtime topup`, item_code: "airtime", amount: 0, is_fixed_amount: false },
            ];
          } else if (pageCategory === "UTILITY") {
            list = [
              { id: 1, biller_code: currentBiller.biller_code, name: "Prepaid Meter Bill Payment", item_code: "prepaid", amount: 0, is_fixed_amount: false },
              { id: 2, biller_code: currentBiller.biller_code, name: "Postpaid Meter Bill Payment", item_code: "postpaid", amount: 0, is_fixed_amount: false },
            ];
          } else if (pageCategory === "CABLE") {
            list = [
              { id: 1, biller_code: currentBiller.biller_code, name: "GOtv Max", item_code: "gotv_max", amount: 4850, is_fixed_amount: true },
              { id: 2, biller_code: currentBiller.biller_code, name: "GOtv Jolli", item_code: "gotv_jolli", amount: 3300, is_fixed_amount: true },
            ];
          } else if (pageCategory === "WAEC") {
            list = [
              { id: 1, biller_code: currentBiller.biller_code, name: "WAEC Result Checker PIN", item_code: "waec_checker", amount: 3500, is_fixed_amount: true },
            ];
          }
          setItems(list);
          setBillsCache(cacheKey, list);
          setIsItemsLoading(false);
          return;
        }

        let idToken = "mock-token";
        if (user) {
          try {
            idToken = await user.getIdToken();
          } catch (tokErr) {
            console.warn("Failed to get idToken:", tokErr);
          }
        }
        const authHeaders = { Authorization: `Bearer ${idToken}` };

        let finalItemList: BillItem[] = [];

        if (pageCategory === "DATA") {
          const res = await fetch(`/api/vtu/data/plans?network=${currentBiller.biller_code}`, {
            headers: authHeaders,
          });
          if (!res.ok) throw new Error("Failed to load data plans from gateway.");
          const data = await res.json();
          finalItemList = (data.data || []).map(
            (plan: { item_code: string; name: string; amount: number; plan_code: string }, index: number) => ({
              id: index + 1,
              biller_code: currentBiller.biller_code,
              name: plan.name,
              item_code: plan.item_code,
              amount: plan.amount,
              is_fixed_amount: true,
            })
          );
        } else if (pageCategory === "AIRTIME") {
          finalItemList = [
            {
              id: 1,
              biller_code: currentBiller.biller_code,
              name: `${currentBiller.name} Airtime topup`,
              item_code: "airtime",
              amount: 0,
              is_fixed_amount: false,
            },
          ];
        } else if (pageCategory === "UTILITY") {
          finalItemList = [
            {
              id: 1,
              biller_code: currentBiller.biller_code,
              name: "Prepaid Meter Bill Payment",
              item_code: "prepaid",
              amount: 0,
              is_fixed_amount: false,
            },
            {
              id: 2,
              biller_code: currentBiller.biller_code,
              name: "Postpaid Meter Bill Payment",
              item_code: "postpaid",
              amount: 0,
              is_fixed_amount: false,
            },
          ];
        } else if (pageCategory === "CABLE") {
          const res = await fetch(`/api/vtu/cable/packages?provider=${currentBiller.biller_code}`, {
            headers: authHeaders,
          });
          if (!res.ok) throw new Error("Failed to load bouquets from gateway.");
          const data = await res.json();
          finalItemList = (data.data || []).map(
            (pkg: { item_code: string; name: string; amount: number; package_code: string }, index: number) => ({
              id: index + 1,
              biller_code: currentBiller.biller_code,
              name: pkg.name,
              item_code: pkg.package_code || pkg.item_code,
              amount: pkg.amount,
              is_fixed_amount: true,
            })
          );
        } else if (pageCategory === "WAEC") {
          const res = await fetch(`/api/vtu/waec/products`, { headers: authHeaders });
          if (!res.ok) throw new Error("Failed to load WAEC products.");
          const data = await res.json();
          finalItemList = (data.data || []).map(
            (prod: { item_code: string; name: string; amount: number; product_code: string }, index: number) => ({
              id: index + 1,
              biller_code: currentBiller.biller_code,
              name: prod.name,
              item_code: prod.product_code || prod.item_code,
              amount: prod.amount,
              is_fixed_amount: true,
            })
          );
        } else {
          const res = await fetch(`/api/bills/items?biller_code=${currentBiller.biller_code}`, {
            headers: authHeaders,
          });
          if (!res.ok) throw new Error("Failed to load packages.");
          const data = await res.json();
          finalItemList = data.data || [];
        }

        setItems(finalItemList);
        setBillsCache(cacheKey, finalItemList);
      } catch (err: unknown) {
        const error = err as Error;
        console.error("Error fetching items:", error.message);
        toast.error("Unable to load billing packages.");
      } finally {
        setIsItemsLoading(false);
      }
    }
    fetchItems();
  }, [selectedBiller, pageCategory, user]);

  // Compute final transaction amount dynamically
  const finalAmount = selectedItem
    ? pageCategory === "WAEC"
      ? selectedItem.amount * (Number(customerId) || 1)
      : selectedItem.is_fixed_amount
      ? selectedItem.amount
      : Number(customAmount)
    : 0;

  // Frontend input validation checks
  const isAirtimeInvalid =
    pageCategory === "AIRTIME" && (Number(customAmount) < 100 || Number(customAmount) > 50000);

  // Interactive Validation handler
  const handleValidateCustomer = async () => {
    if (!selectedBiller || !selectedItem || !customerId) {
      toast.error("Please select a provider, package, and enter your customer ID.");
      return;
    }

    setIsValidating(true);
    setValidatedName("");

    try {
      let res;
      if (pageCategory === "UTILITY") {
        res = await fetch(
          `/api/vtu/electricity/validate?provider=${selectedBiller.biller_code}&meterNo=${customerId}&meterType=${selectedItem.item_code}`
        );
      } else if (pageCategory === "CABLE") {
        res = await fetch(
          `/api/vtu/cable/validate?provider=${selectedBiller.biller_code}&smartCardNo=${customerId}`
        );
      } else {
        res = await fetch("/api/bills/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_code: selectedItem.item_code,
            customer_id: customerId,
            biller_code: selectedBiller.biller_code,
          }),
        });
      }

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        throw new Error(
          resData.error || resData.message || "Customer validation failed. Please check identifier."
        );
      }

      setValidatedName(resData.name || "VALIDATED CUSTOMER");
      if (resData.address) {
        setValidatedName((prev) => `${prev} (${resData.address})`);
      }
      toast.success("Billing verification successful!");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Customer Validation Error]:", error.message);
      toast.error(error.message || "Unable to verify recipient with provider.");
    } finally {
      setIsValidating(false);
    }
  };

  // Submit trigger - Opens Pin Keypad Modal
  const handlePayTrigger = () => {
    if (!selectedBiller || !selectedItem || !customerId) {
      toast.error("Please fill out all billing details.");
      return;
    }

    if (!finalAmount || finalAmount <= 0) {
      toast.error("Please specify a valid payment amount.");
      return;
    }

    if (isAirtimeInvalid) {
      toast.error("Airtime amount must be between ₦100 and ₦50,000.");
      return;
    }

    const currentSelectedBalance = walletTypeSelected === "BONUS" ? bonusBalance : balance;
    if (finalAmount > currentSelectedBalance) {
      toast.error(
        `Insufficient ${
          walletTypeSelected === "BONUS" ? "bonus reward" : "wallet"
        } balance. Required: ₦${finalAmount.toLocaleString()}, Available: ₦${currentSelectedBalance.toLocaleString()}`
      );
      return;
    }

    if (walletTypeSelected === "BONUS") {
      const typeUpper = (pageCategory || "").toUpperCase();
      if (typeUpper === "AIRTIME") {
        if (finalAmount > 200) {
          toast.error("Bonus Airtime purchases are limited to a maximum of ₦200 NGN per day.");
          return;
        }
      } else if (typeUpper === "DATA") {
        const normalizedName = (selectedItem?.name || "").toLowerCase();
        let isWithinLimit = false;
        if (normalizedName.includes("mb") || normalizedName.includes("megabyte")) {
          isWithinLimit = true;
        } else {
          const match = normalizedName.match(/([\d.]+)\s*gb/);
          if (match) {
            const gbVal = parseFloat(match[1]);
            if (!isNaN(gbVal) && gbVal <= 1.0) {
              isWithinLimit = true;
            }
          } else if (normalizedName.includes("1gb") || normalizedName.includes("1 gb")) {
            isWithinLimit = true;
          }
        }
        if (!isWithinLimit && normalizedName) {
          toast.error(
            "Using the bonus wallet, you can only purchase Data plans within a 1GB limit (e.g. 1GB or less)."
          );
          return;
        }
      }
    }

    // Open PIN pad modal and close checkout modal
    setIsPinModalOpen(true);
  };

  // Final Payment execution
  const executePayment = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    setIsPaying(true);
    setIsPinModalOpen(false);
    setIsCheckoutModalOpen(false);
    toast.loading("Verifying transaction authorization securely...");

    try {
      let idToken = "mock-token";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const pinVerifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin, isBiometricAuthenticated }),
      });

      const pinData = await pinVerifyRes.json();
      if (!pinVerifyRes.ok || !pinData.success) {
        throw new Error(pinData.error || pinData.message || "Authorization failed. Please try again.");
      }

      toast.loading("Processing your transaction with gateway...");

      const isData = pageCategory === "DATA";
      const isAirtime = pageCategory === "AIRTIME";
      const isUtility = pageCategory === "UTILITY";
      const isCable = pageCategory === "CABLE";
      const isWaec = pageCategory === "WAEC";

      if (isAirtime || isData || isUtility || isCable || isWaec) {
        const endpoint = isData
          ? "/api/vtu/data"
          : isUtility
          ? "/api/vtu/electricity"
          : isCable
          ? "/api/vtu/cable"
          : isWaec
          ? "/api/vtu/waec"
          : "/api/vtu/airtime";
        const payload = isData
          ? {
              network: selectedBiller?.biller_code,
              phone: customerId,
              item_code: selectedItem?.item_code,
              walletType: walletTypeSelected,
            }
          : isUtility
          ? {
              provider: selectedBiller?.biller_code,
              meterNo: customerId,
              meterType: selectedItem?.item_code,
              amount: finalAmount,
            }
          : isCable
          ? {
              provider: selectedBiller?.biller_code,
              smartCardNo: customerId,
              packageCode: selectedItem?.item_code,
            }
          : isWaec
          ? {
              productCode: selectedItem?.item_code,
              quantity: Number(customerId) || 1,
            }
          : {
              network: selectedBiller?.biller_code,
              phone: customerId,
              amount: finalAmount,
              walletType: walletTypeSelected,
            };

        let res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          console.log("[VTU Pay] Auth token expired or invalid, forcing refresh and retrying S2S...");
          if (user && typeof user.getIdToken === "function") {
            idToken = await user.getIdToken(true);
          }

          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(payload),
          });
        }

        const data = await res.json();
        toast.dismiss();

        if (!res.ok || !data.success) {
          throw new Error(data.message || data.error || "Failed to process transaction.");
        }

        setSuccessReceipt({
          reference: data.requestId,
          tx_ref: data.orderId || data.requestId,
          amount: finalAmount,
          pins: data.pins || undefined,
        });
        toast.success("Transaction completed successfully!");
      } else {
        let res = await fetch("/api/bills/pay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            biller_code: selectedBiller?.biller_code,
            item_code: selectedItem?.item_code,
            amount: finalAmount,
            customer_id: customerId,
            biller_name: selectedBiller?.name,
            biller_type: pageCategory.toLowerCase(),
            pin,
            walletType: walletTypeSelected,
          }),
        });

        if (res.status === 401) {
          console.log("[Bills Pay] Auth token expired or invalid, forcing refresh and retrying...");
          if (user && typeof user.getIdToken === "function") {
            idToken = await user.getIdToken(true);
          }

          res = await fetch("/api/bills/pay", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              biller_code: selectedBiller?.biller_code,
              item_code: selectedItem?.item_code,
              amount: finalAmount,
              customer_id: customerId,
              biller_name: selectedBiller?.name,
              biller_type: pageCategory.toLowerCase(),
              pin,
              walletType: walletTypeSelected,
            }),
          });
        }

        const data = await res.json();
        toast.dismiss();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to process bill payment.");
        }

        setSuccessReceipt(data.data);
        toast.success("Bill payment processed successfully!");
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.dismiss();
      toast.error(error.message || "Your transaction failed. Your wallet balance is safe.");
    } finally {
      setIsPaying(false);
    }
  };

  const getCustomerFieldLabel = () => {
    switch (pageCategory) {
      case "AIRTIME":
      case "DATA":
        return "Phone Number";
      case "BETTING":
        return "User ID";
      case "CABLE":
        return "Smartcard / Decoder Number";
      case "UTILITY":
        return "Meter Number";
      case "WAEC":
        return "Quantity (1-5)";
      default:
        return "Customer Identifier";
    }
  };

  if (pagePreloading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white/20 backdrop-blur-[1px] p-6">
        <div className="relative flex flex-col items-center">
          <div className="flex flex-col items-center p-5 rounded-2xl bg-white/40 backdrop-blur-md border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.0, ease: "linear" }}
                className="absolute inset-0 rounded-full border-[2px] border-gray-100/80 border-t-[#FC7A00] border-r-[#0b513d]"
              />
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="relative w-7 h-7 bg-white rounded-full flex items-center justify-center overflow-hidden"
              >
                <AppLogo size={24} />
              </motion.div>
            </div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
              className="mt-3 font-hanken font-bold text-[8px] tracking-[0.25em] uppercase text-gray-500 select-none"
            >
              E-Global Pay
            </motion.p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <RouteGuard>
      <div className="min-h-dvh bg-background text-on-background pb-32">
        <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

        <main className="max-w-md mx-auto mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-28 min-[375px]:pb-32 text-black">
          {/* Title Row with Back History Button */}
          <div className="flex items-center gap-4 mb-5">
            <button
              onClick={() => { triggerHaptic(); window.history.back(); }}
              className="w-10 h-10 rounded-full border border-gray-150 bg-white flex items-center justify-center text-gray-700 hover:text-black hover:border-gray-200 active:scale-95 transition-all duration-300 cursor-pointer shadow-none"
              title="Go Back"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
            </button>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF5EB] to-[#FFF0E0] border border-[#FFD0A1] flex items-center justify-center flex-shrink-0 shadow-none">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  {getPageIcon()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-bodoni text-[18px] min-[375px]:text-[20px] font-bold tracking-tight text-black truncate">
                  {getPageTitle()}
                </h1>
                <p className="font-hanken text-[11px] text-gray-500 font-medium truncate">
                  Settle {getPageTitle().toLowerCase()} instantly using your NGN balance
                </p>
              </div>
            </div>

            <Link
              href="/bills/history"
              className="px-3 py-1.5 rounded-xl border border-[#FC7A00]/30 bg-[#FC7A00]/10 text-[#FC7A00] hover:bg-[#FC7A00] hover:text-white transition-all text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer flex-shrink-0"
              title="View Bills History"
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span className="hidden min-[360px]:inline">History</span>
            </Link>
          </div>

          {/* Marketing Slide Banners - displayed below page title and back history */}
          <BannerSlideshow page="bills" />

          <AnimatePresence mode="wait">
            {successReceipt ? (
              // --- GLASSMORPHIC SUCCESS SCREEN / RECEIPT ---
              <BillSuccessReceipt
                receipt={successReceipt}
                selectedBiller={selectedBiller}
                selectedItem={selectedItem}
                customerId={customerId}
                finalAmount={finalAmount}
                getCustomerFieldLabel={getCustomerFieldLabel}
                onPayAnother={() => {
                  setSuccessReceipt(null);
                  setCustomerId("");
                  setCustomAmount("");
                  setSelectedBiller(null);
                  setSelectedItem(null);
                }}
              />
            ) : (
              // --- FORM AND INPUT CONTAINER Restructured to have separate network and plan cards ---
              <div className="space-y-6">
                {/* Standalone Network Selection Card */}
                <BillerSelectionCard
                  billers={billers}
                  selectedBiller={selectedBiller}
                  isLoading={isBillersLoading}
                  onSelectBiller={(b) => {
                    setSelectedBiller(b);
                    setSelectedItem(null);
                    setCustomerId("");
                    setCustomAmount("");
                    setValidatedName("");
                  }}
                />

                {/* Standalone Plan Selection Card below Network Card */}
                {selectedBiller && (
                  <BillPlanSelectionCard
                    items={items}
                    selectedItem={selectedItem}
                    isLoading={isItemsLoading}
                    pageCategory={pageCategory}
                    onSelectItem={(i) => {
                      setSelectedItem(i);
                      if (pageCategory === "DATA") {
                        setCustomAmount(i.amount.toString());
                      } else {
                        setCustomAmount("");
                      }
                      setCustomerId("");
                      setValidatedName("");
                      setIsCheckoutModalOpen(true);
                    }}
                  />
                )}
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* Dynamic high-fidelity checkout bottom-sheet modal */}
        <BillCheckoutModal
          isOpen={isCheckoutModalOpen}
          selectedBiller={selectedBiller}
          selectedItem={selectedItem}
          pageCategory={pageCategory}
          finalAmount={finalAmount}
          balance={balance}
          bonusBalance={bonusBalance}
          walletTypeSelected={walletTypeSelected}
          customerId={customerId}
          validatedName={validatedName}
          customAmount={customAmount}
          isValidating={isValidating}
          isPaying={isPaying}
          isAirtimeInvalid={isAirtimeInvalid}
          onClose={() => setIsCheckoutModalOpen(false)}
          onWalletTypeChange={(wt) => setWalletTypeSelected(wt)}
          onCustomerIdChange={(val) => setCustomerId(val)}
          onValidateCustomer={handleValidateCustomer}
          onCustomAmountChange={(val) => setCustomAmount(val)}
          onPayTrigger={handlePayTrigger}
          getCustomerFieldLabel={getCustomerFieldLabel}
          getReviewModalTitle={getReviewModalTitle}
        />

        {/* Dynamic transaction PIN verification keypad - Full Screen Modal Design */}
        <BillPinModal
          isOpen={isPinModalOpen}
          selectedBiller={selectedBiller}
          selectedItem={selectedItem}
          finalAmount={finalAmount}
          onClose={() => setIsPinModalOpen(false)}
          onExecutePayment={executePayment}
        />

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
