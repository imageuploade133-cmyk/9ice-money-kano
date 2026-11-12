"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuth } from "@/lib/AuthContext";
import { useCards } from "@/hooks/useCards";
import { CardItem, CardTransaction, BillingAddress } from "@/types/cards";
import { cn } from "@/lib/utils";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { RequestCardModal } from "@/components/cards/RequestCardModal";
import { useAppConfig } from "@/lib/ConfigContext";
import { isFeatureEnabled, getFeatureDisabledMessage } from "@/lib/feature-toggle";
import { FeatureDisabledBanner } from "@/components/FeatureDisabledBanner";

export default function CardsPage() {
  const { userData, user } = useAuth();
  const { config } = useAppConfig();
  const isVirtualCardsEnabled = isFeatureEnabled(config?.featureToggles, "virtual_cards");
  const {
    cards,
    loading,
    error,
    refreshCards,
    createCard,
    fundCard,
    withdrawFromCard,
    toggleFreeze,
    terminateCard,
    viewSecureDetails,
    getTransactions,
  } = useCards();

  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [revealDetails, setRevealDetails] = useState<Record<string, boolean>>({});
  const [secureDetails, setSecureDetails] = useState<Record<string, { cardNumber: string; expiry: string; cvv: string }>>({});
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Request Form States
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintProgress, setMintProgress] = useState(0);
  const [mintStatusText, setMintStatusText] = useState("");

  const [formCurrency, setFormCurrency] = useState<"NGN" | "USD">("USD");
  const [initialAmount, setInitialAmount] = useState<string>("5.00");
  const [formName, setFormName] = useState("");

  // Billing Address States
  const [billingCountry, setBillingCountry] = useState("US");
  const [billingState, setBillingState] = useState("CA");
  const [billingCity, setBillingCity] = useState("San Francisco");
  const [billingPostalCode, setBillingPostalCode] = useState("94105");
  const [billingStreetAddress, setBillingStreetAddress] = useState("333 Fremont Street");

  // Funding & Withdrawal Modal states
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  // Transactions Filtering & Pagination States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUCCESSFUL" | "FAILED">("ALL");
  const [merchantFilter, setMerchantFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, merchantFilter, startDate, endDate, activeCardIndex]);

  // Prevent background scrolling while request cards drawer or modals are active
  useEffect(() => {
    if (showRequestSheet || fundModalOpen || withdrawModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showRequestSheet, fundModalOpen, withdrawModalOpen]);

  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const currentPhoto = (userData?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  const activeCard = cards[activeCardIndex] || null;

  // Sync displayed Name On Card
  useEffect(() => {
    if (userData || user) {
      const resolvedName = (userData?.name || user?.displayName || "JULES VERNE").toUpperCase();
      setFormName(resolvedName);
    }
  }, [user, userData]);

  // Load transactions whenever active card index changes
  useEffect(() => {
    if (activeCard) {
      setTxLoading(true);
      getTransactions(activeCard.id)
        .then((txs) => setTransactions(txs))
        .finally(() => setTxLoading(false));
    } else {
      setTransactions([]);
    }
  }, [activeCardIndex, cards]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth - container.clientWidth;
    const progress = scrollWidth > 0 ? (scrollLeft / scrollWidth) * 100 : 0;
    setScrollProgress(progress);

    const children = container.children;
    if (children.length > 0) {
      let closestIndex = 0;
      let minDistance = Infinity;
      const containerCenter = scrollLeft + container.clientWidth / 2;

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const childCenter = child.offsetLeft + child.clientWidth / 2;
        const distance = Math.abs(containerCenter - childCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }
      if (closestIndex !== activeCardIndex) {
        setActiveCardIndex(closestIndex);
      }
    }
  };

  const handleRevealToggle = async (card: CardItem) => {
    const isCurrentlyRevealed = revealDetails[card.id];
    if (isCurrentlyRevealed) {
      setRevealDetails((prev) => ({ ...prev, [card.id]: false }));
      return;
    }

    try {
      toast.info("Retrieving secure card details...");
      const details = await viewSecureDetails(card.id);
      if (details) {
        setSecureDetails((prev) => ({
          ...prev,
          [card.id]: {
            cardNumber: details.cardNumber,
            expiry: details.expiry,
            cvv: details.cvv,
          },
        }));
        setRevealDetails((prev) => ({ ...prev, [card.id]: true }));

        // Auto-hide secure details after 15 seconds to ensure premium security
        setTimeout(() => {
          setRevealDetails((prev) => ({ ...prev, [card.id]: false }));
        }, 15000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFreeze = async (card: CardItem) => {
    try {
      const nextLockedState = !card.isLocked;
      await toggleFreeze(card.id, nextLockedState);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTerminateCard = async (card: CardItem) => {
    if (!confirm("Are you sure you want to terminate this virtual card permanently? All remaining balances will be automatically refunded back to your wallet.")) {
      return;
    }
    try {
      toast.info("Terminating your virtual card...");
      await terminateCard(card.id);
      setActiveCardIndex(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenRequest = () => {
    if (!isVirtualCardsEnabled) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, "virtual_cards"));
      return;
    }
    setFormCurrency("USD");
    setInitialAmount("5.00");
    setBillingCountry("US");
    setBillingState("CA");
    setBillingCity("San Francisco");
    setBillingPostalCode("94105");
    setBillingStreetAddress("333 Fremont Street");
    setShowRequestSheet(true);
  };

  const handleCancelRequest = () => {
    if (isMinting) return;
    setShowRequestSheet(false);
  };

  const handleRequestCardSubmit = async (data: {
    currency: "USD" | "NGN";
    amount: number;
    billingAddress: BillingAddress;
    nameOnCard: string;
  }) => {
    setIsMinting(true);
    setMintProgress(0);
    setMintStatusText("VERIFYING WALLET LEDGER...");

    const steps = [
      { progress: 20, text: "PROVISIONING SECURE S2S KEYS..." },
      { progress: 50, text: "GENERATING CARD NUMBER & SEEDING CVV..." },
      { progress: 80, text: "ISSUING DIGITAL SANCTIONS CLEARANCE..." },
      { progress: 100, text: "CARD MINTED SUCCESSFULLY!" }
    ];

    let currentStepIndex = 0;
    const progressInterval = setInterval(() => {
      setMintProgress((prev) => {
        const nextProgress = prev + 5;
        const currentStep = steps[currentStepIndex];
        if (currentStep && nextProgress >= currentStep.progress) {
          setMintStatusText(currentStep.text);
          currentStepIndex++;
        }
        if (nextProgress >= 100) {
          clearInterval(progressInterval);
          executeMintCard(data);
          return 100;
        }
        return nextProgress;
      });
    }, 150);
  };

  const executeMintCard = async (data: {
    currency: "USD" | "NGN";
    amount: number;
    billingAddress: BillingAddress;
    nameOnCard: string;
  }) => {
    try {
      await createCard({
        currency: data.currency,
        amount: data.amount,
        billingAddress: data.billingAddress,
        cardholder: data.nameOnCard,
      });
      setIsMinting(false);
      setShowRequestSheet(false);
      setActiveCardIndex(0);
    } catch (err) {
      setIsMinting(false);
    }
  };

  const handleFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;
    const amount = Number(fundAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsActionSubmitting(true);
    try {
      await fundCard(activeCard.id, amount);
      setFundModalOpen(false);
      setFundAmount("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;
    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsActionSubmitting(true);
    try {
      await withdrawFromCard(activeCard.id, amount);
      setWithdrawModalOpen(false);
      setWithdrawAmount("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const thumbWidth = Math.max(20, 100 / (cards.length || 1));
  const thumbLeft = (scrollProgress / 100) * (100 - thumbWidth);

  // Dynamic filter lists for layout calculation
  const filteredTransactions = transactions.filter((tx) => {
    // 1. Search text
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchDesc = tx.description?.toLowerCase().includes(term);
      const matchMerch = tx.merchant?.toLowerCase().includes(term);
      if (!matchDesc && !matchMerch) return false;
    }

    // 2. Status Filter
    if (statusFilter !== "ALL") {
      if (tx.status?.toUpperCase() !== statusFilter) return false;
    }

    // 3. Merchant Filter
    if (merchantFilter !== "ALL") {
      if (tx.merchant?.toLowerCase() !== merchantFilter.toLowerCase()) return false;
    }

    // 4. Date Range Filter
    if (startDate) {
      const start = new Date(startDate);
      const txDate = new Date(tx.createdAt);
      if (txDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const txDate = new Date(tx.createdAt);
      if (txDate > end) return false;
    }

    return true;
  });

  // Calculate Paginated Transactions
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Extract unique merchants list for quick filter select
  const uniqueMerchants = Array.from(
    new Set(transactions.map((tx) => tx.merchant))
  ).filter(Boolean);

  return (
    <>
      <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

      <main className="mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-28 min-[375px]:pb-32 text-black overflow-x-hidden">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto space-y-5"
        >
          {/* Header Action Nav */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { triggerHaptic(); window.history.back(); }}
                className="w-10 h-10 rounded-full border border-gray-150 bg-white flex items-center justify-center text-gray-700 hover:text-black hover:border-gray-200 active:scale-95 transition-all duration-300 cursor-pointer shadow-none"
                title="Go Back"
              >
                <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
              </button>
              <div>
                <h2 className="font-hanken font-extrabold text-lg text-black leading-tight">Virtual Cards</h2>
                <p className="font-hanken text-[11px] text-gray-400 font-bold uppercase tracking-wider">E-Tech secure center</p>
              </div>
            </div>

            <button
              onClick={handleOpenRequest}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-95 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">add_card</span>
              Create Card
            </button>
          </div>

          {/* Feature Disabled Banner */}
          {!isVirtualCardsEnabled && (
            <FeatureDisabledBanner
              title="Virtual Cards Unavailable"
              message={getFeatureDisabledMessage(config?.featureToggles, "virtual_cards")}
            />
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-error/5 text-error rounded-2xl border border-error/10 text-xs font-semibold text-center">
              Failed to load cards: {error}. Please reload.
            </div>
          )}

          {/* Skeleton Loaders */}
          {loading ? (
            <div className="space-y-4">
              <div className="w-full aspect-[1.58/1] rounded-[24px] skeleton-shimmer bg-gray-200" />
              <div className="h-10 w-full skeleton-shimmer bg-gray-100 rounded-2xl" />
            </div>
          ) : cards.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12 space-y-3 bg-white border border-gray-150 rounded-2xl p-6 shadow-sm">
              <span className="material-symbols-outlined text-[48px] text-gray-300">credit_card</span>
              <p className="font-hanken font-bold text-xs text-gray-400 uppercase tracking-widest">No Active Cards Found</p>
              <p className="font-hanken text-[10px] text-gray-400">Request your first USD or NGN Virtual Card to get started.</p>
              <button
                onClick={handleOpenRequest}
                className="mx-auto px-4 py-2 bg-black text-white rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Issue Card
              </button>
            </div>
          ) : (
            /* Deck of Cards */
            <div className="space-y-4">
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar px-margin-mobile -mx-margin-mobile py-2.5"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {cards.map((card, idx) => {
                  const revealed = revealDetails[card.id];
                  const sDetails = secureDetails[card.id];
                  const displayPan = revealed && sDetails ? sDetails.cardNumber : card.maskedPan;
                  const displayCvv = revealed && sDetails ? sDetails.cvv : "•••";

                  return (
                    <div
                      key={card.id}
                      className="snap-center shrink-0 w-[calc(100vw-32px)] max-w-sm"
                    >
                      <div
                        className={cn(
                          "w-full aspect-[1.58/1] rounded-[24px] p-6 text-white relative overflow-hidden flex flex-col justify-between shadow-lg transition-all duration-300",
                          activeCardIndex === idx ? "scale-100 opacity-100 ring-2 ring-[#FC7A00]/45" : "scale-[0.96] opacity-60",
                          card.currency === "USD"
                            ? "bg-gradient-to-br from-[#111] via-[#222] to-[#0d0d0d] border border-white/5"
                            : "bg-gradient-to-br from-[#FC7A00] via-[#FF9022] to-[#dd5500] border border-white/10"
                        )}
                      >
                        <div className="absolute right-[-40px] bottom-[-40px] w-48 h-48 rounded-full bg-white/5 blur-3xl pointer-events-none" />

                        {/* Top: Logo & Currency Badge */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <div className="relative w-5 h-5 flex-shrink-0">
                              <Image
                                src="https://i.ibb.co/WWjZrtC7/E-Tech.png"
                                alt="E-Tech Logo"
                                fill
                                sizes="20px"
                                className="object-contain brightness-0 invert"
                              />
                            </div>
                            <span className="font-hanken font-bold text-[10px] uppercase tracking-wider">
                              E-TECH GLOBAL HUB
                            </span>
                          </div>

                          <span className="px-3 py-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-[10px] font-black uppercase tracking-widest text-white flex-shrink-0">
                            {card.currency} Virtual
                          </span>
                        </div>

                        {/* Middle: PAN, Expiry, CVV */}
                        <div className="space-y-4 w-full">
                          <p
                            onClick={() => copyToClipboard(displayPan.replace(/\s+/g, ""), "Card Number")}
                            className="font-mono font-bold text-base min-[370px]:text-lg tracking-widest text-white cursor-pointer hover:opacity-80 transition-all"
                          >
                            {displayPan}
                          </p>

                          <div className="flex justify-between items-end w-full">
                            <div>
                              <p className="text-[7px] uppercase text-white/50 tracking-wider">Card Holder</p>
                              <p className="font-mono text-xs font-bold text-white truncate max-w-[150px]">
                                {card.cardholder}
                              </p>
                            </div>

                            <div className="flex gap-4">
                              <div>
                                <p className="text-[7px] uppercase text-white/50 tracking-wider">Expiry</p>
                                <p className="font-mono text-xs font-bold text-white">
                                  {card.expiry}
                                </p>
                              </div>
                              <div>
                                <p className="text-[7px] uppercase text-white/50 tracking-wider">CVV</p>
                                <p className="font-mono text-xs font-bold text-white">
                                  {displayCvv}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Frozen Overlay */}
                        {card.isLocked && (
                          <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center text-center p-4 z-20 rounded-[24px]">
                            <span className="material-symbols-outlined text-[36px] text-error mb-2 animate-pulse">ac_unit</span>
                            <p className="font-hanken font-bold text-sm text-white">Card Temporarily Frozen</p>
                            <p className="font-hanken text-[10px] text-gray-400 mt-1">Tap activate below to lift freeze</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Slider Drag/Slide Card Progress Bar Indicator */}
              <div className="flex flex-col items-center justify-center space-y-1.5 py-1 select-none pointer-events-none">
                <div className="w-24 h-1.5 bg-gray-100 rounded-full relative overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 bg-[#FC7A00] rounded-full transition-all duration-75"
                    style={{
                      width: `${thumbWidth}%`,
                      left: `${thumbLeft}%`
                    }}
                  />
                </div>
                <span className="font-hanken text-[9px] font-bold uppercase tracking-widest text-gray-400">
                  Swipe card to view ({activeCardIndex + 1} of {cards.length})
                </span>
              </div>

              {/* Card Action Menu Grid */}
              {activeCard && (
                <div className="space-y-4">
                  {/* Balance Display Card */}
                  <div className="bg-white border border-gray-150 rounded-2xl p-5 flex justify-between items-center shadow-sm">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Current Card Balance</p>
                      <h3 className="font-mono text-2xl font-black text-black mt-1">
                        {activeCard.currency === "NGN" ? "₦" : "$"}
                        {activeCard.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFundModalOpen(true)}
                        className="px-3.5 py-2 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Fund
                      </button>
                      <button
                        onClick={() => setWithdrawModalOpen(true)}
                        className="px-3.5 py-2 bg-black hover:brightness-110 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">vertical_align_bottom</span>
                        Withdraw
                      </button>
                    </div>
                  </div>

                  {/* Actions Matrix */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleRevealToggle(activeCard)}
                      className="py-3 bg-white border border-gray-150 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-sm text-gray-700"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {revealDetails[activeCard.id] ? "visibility_off" : "visibility"}
                      </span>
                      {revealDetails[activeCard.id] ? "Hide Details" : "Show Details"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleFreeze(activeCard)}
                      className={cn(
                        "py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-sm",
                        activeCard.isLocked
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          : "bg-error/5 text-error border border-error/15"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {activeCard.isLocked ? "lock_open" : "lock"}
                      </span>
                      {activeCard.isLocked ? "Unfreeze" : "Freeze"}
                    </button>
                  </div>

                  {/* Danger Zone Termination */}
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex justify-between items-center shadow-none">
                    <div>
                      <p className="font-hanken font-bold text-xs text-red-600">Terminate Virtual Card</p>
                      <p className="font-hanken text-[9px] text-red-400 mt-0.5">Permanently disable and close this card profile.</p>
                    </div>
                    <button
                      onClick={() => handleTerminateCard(activeCard)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      Terminate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transactions Module */}
          {activeCard && (
            <div className="space-y-4 pt-2">
              <h3 className="font-hanken font-extrabold text-xs text-gray-400 tracking-wider uppercase border-b border-gray-100 pb-2">
                Card Transactions
              </h3>

              {/* Transactions Controls & Filters */}
              {transactions.length > 0 && (
                <div className="space-y-3 bg-white border border-gray-150 p-4 rounded-2xl shadow-sm">
                  {/* Search and Merchant Select */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Search</span>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search Netflix, Spotify..."
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black placeholder-gray-400 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Merchant</span>
                      <select
                        value={merchantFilter}
                        onChange={(e) => setMerchantFilter(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none h-[34px] cursor-pointer"
                      >
                        <option value="ALL">All Merchants</option>
                        {uniqueMerchants.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Status & Date Range Filters */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Status</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none h-[34px] cursor-pointer"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="SUCCESSFUL">Successful</option>
                        <option value="FAILED">Failed</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Start Date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-2 py-1.5 text-[11px] font-semibold text-black outline-none h-[34px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">End Date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-2 py-1.5 text-[11px] font-semibold text-black outline-none h-[34px]"
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setMerchantFilter("ALL");
                          setStatusFilter("ALL");
                          setStartDate("");
                          setEndDate("");
                        }}
                        className="w-full h-[34px] bg-gray-100 hover:bg-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-700 rounded-xl transition-all"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {txLoading ? (
                <div className="space-y-2">
                  <div className="h-10 skeleton-shimmer bg-gray-100 rounded-xl" />
                  <div className="h-10 skeleton-shimmer bg-gray-100 rounded-xl" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-150 rounded-2xl text-gray-400 text-xs font-semibold p-4 shadow-sm">
                  No transaction history matched your filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white border border-gray-150 p-4 rounded-xl flex justify-between items-center shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-hanken font-bold text-xs text-black leading-tight">{tx.description}</p>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                            tx.status === "SUCCESSFUL" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                          )}>
                            {tx.status}
                          </span>
                        </div>
                        <p className="font-hanken text-[8px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">
                          {tx.merchant} • {new Date(tx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="font-mono font-bold text-xs text-black">
                        -{tx.currency === "NGN" ? "₦" : "$"}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center bg-white border border-gray-150 p-3 rounded-xl mt-4 shadow-sm">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-black rounded-lg text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 transition-all cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="font-hanken text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-black rounded-lg text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 transition-all cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Request Virtual Card Standalone Modal */}
      <RequestCardModal
        isOpen={showRequestSheet}
        onClose={handleCancelRequest}
        defaultName={formName}
        isMinting={isMinting}
        mintProgress={mintProgress}
        mintStatusText={mintStatusText}
        onRequestCard={handleRequestCardSubmit}
      />

      {/* Fund Modal */}
      {fundModalOpen && activeCard && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFundModalOpen(false)} />
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full z-10 space-y-4 text-black border border-gray-100">
            <h3 className="font-hanken font-extrabold text-sm text-black uppercase tracking-wider">Fund Virtual Card</h3>
            <p className="text-[10px] text-gray-400">Deduct from your main {activeCard.currency} wallet atomically.</p>
            <form onSubmit={handleFundSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Enter amount to fund"
                className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
              />
              <button
                type="submit"
                disabled={isActionSubmitting}
                className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white text-xs font-bold rounded-2xl uppercase tracking-wider"
              >
                {isActionSubmitting ? "Processing..." : "Confirm Funding"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {withdrawModalOpen && activeCard && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setWithdrawModalOpen(false)} />
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full z-10 space-y-4 text-black border border-gray-100">
            <h3 className="font-hanken font-extrabold text-sm text-black uppercase tracking-wider">Withdraw Card Funds</h3>
            <p className="text-[10px] text-gray-400">Move money instantly from Card to main {activeCard.currency} wallet.</p>
            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Enter amount to withdraw"
                className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
              />
              <button
                type="submit"
                disabled={isActionSubmitting}
                className="w-full py-3.5 bg-black text-white text-xs font-bold rounded-2xl uppercase tracking-wider"
              >
                {isActionSubmitting ? "Processing..." : "Confirm Withdrawal"}
              </button>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </>
  );
}
