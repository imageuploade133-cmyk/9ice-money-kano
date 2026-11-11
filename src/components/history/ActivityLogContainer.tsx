"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import { TransactionReceipt, Transaction } from "@/components/wallet/TransactionReceipt";
import { TransactionIcon } from "@/components/wallet/TransactionIcon";
import { formatTransactionDateTime } from "@/lib/date-utils";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, startAfter, onSnapshot, getDoc, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { parseTransactionDoc, processPendingDocChanges, applyPendingTransactionsUpdate } from "@/lib/transaction-history-utils";
import { toast } from "sonner";
import { getTransactionLedgerStatus, isCreditTransaction, getTransactionDisplayAmount } from "@/lib/transaction-status-normalizer";
import { StatementModal } from "@/components/history/StatementModal";

export const ActivityLogContainer: React.FC = () => {
  const router = useRouter();
  const { userData, user } = useAuth();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "deposit" | "transfer" | "bills" | "swap" | "card">("all");
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState<"ALL" | "NGN" | "USD">("ALL");
  const hasPushedState = useRef(false);

  // Total Fund Received This Month state
  const [monthlyCreditTotal, setMonthlyCreditTotal] = useState<number>(0);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState<boolean>(false);

  // Pagination states for low read operations
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const transactionsRef = useRef<Transaction[]>([]);
  transactionsRef.current = transactions;

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Sync state with browser back history for receipt drawer
  useEffect(() => {
    if (selectedTx) {
      window.history.pushState({ receiptOpen: true }, "");
      hasPushedState.current = true;

      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault();
        hasPushedState.current = false;
        setSelectedTx(null);
      };

      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
        if (hasPushedState.current) {
          window.history.back();
          hasPushedState.current = false;
        }
      };
    }
  }, [selectedTx]);

  // Initial secure paginated loading of transactions with low-read session cache
  const fetchInitialTransactions = async (forceRefresh = false) => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock || !user) {
      setTransactions([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`history_transactions_cache_${user.uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.data) && Date.now() - parsed.timestamp < 3 * 60 * 1000) {
            setTransactions(parsed.data);
            setHasMore(Boolean(parsed.hasMore));
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall back to getDocs
      }
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(15)
      );

      const snap = await getDocs(q);
      const list: Transaction[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          reference: data.reference || docSnap.id,
          type: data.type || "DEPOSIT",
          amount: Number(data.amount) || 0,
          currency: data.currency || "NGN",
          description: data.description || "",
          recipientName: data.recipientName || "",
          bankName: data.bankName || "",
          status: data.status || "PENDING",
          date: data.date || "",
          time: data.time || "",
          fee: Number(data.fee) || 0,
          vat: Number(data.vat) || 0,
          markup: Number(data.markup) || 0,
          totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
          totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
        });
      });

      setTransactions(list);
      if (list.length === 0) {
        toast.info("No history");
      }

      const moreAvailable = snap.docs.length >= 15;
      if (!moreAvailable) {
        setHasMore(false);
      } else {
        setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(true);
      }

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            `history_transactions_cache_${user.uid}`,
            JSON.stringify({ data: list, hasMore: moreAvailable, timestamp: Date.now() })
          );
        } catch {
          // Ignore storage write errors
        }
      }
    } catch (err) {
      console.error("[HistoryPage Initial Load Exception]:", err);
      setTransactions([]);
      setHasMore(false);
      toast.info("No history");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchInitialTransactions();

    const fetchMonthlyTotal = async () => {
      if (!user) return;
      try {
        const now = new Date();
        const startOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const qMonth = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          where("createdAt", ">=", startOfMonthIso)
        );

        const monthSnap = await getDocs(qMonth);
        let total = 0;
        monthSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const txObj = { ...data } as Transaction;
          const statusUpper = (data.status || "").toUpperCase();
          const isSuccess = statusUpper === "SUCCESS" || statusUpper === "COMPLETED" || data.credited === true || data.alreadyCredited === true;
          if (isSuccess && isCreditTransaction(txObj)) {
            total += getTransactionDisplayAmount(txObj);
          }
        });

        setMonthlyCreditTotal(total);
      } catch (err) {
        console.warn("[Monthly Total Credit Fetch Warning]:", err);
      }
    };

    fetchMonthlyTotal();

    // Attach real-time listeners for initial batch AND active pending transactions across all pagination pages
    let unsubscribeMain: (() => void) | null = null;
    let unsubscribePending: (() => void) | null = null;
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";

    if (!isMock && user) {
      try {
        const qMain = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(15)
        );

        // 1. Primary listener for top 15 recent transactions
        unsubscribeMain = onSnapshot(
          qMain,
          (snap) => {
            const snapshotList: Transaction[] = [];
            snap.forEach((docSnap) => {
              snapshotList.push(parseTransactionDoc(docSnap));
            });

            setTransactions((prev) => {
              const txMap = new Map<string, Transaction>();

              snapshotList.forEach((tx) => {
                txMap.set(tx.id, tx);
              });

              prev.forEach((tx) => {
                if (!txMap.has(tx.id)) {
                  txMap.set(tx.id, tx);
                }
              });

              const merged = Array.from(txMap.values()).sort((a, b) => {
                const tA = new Date(a.createdAt || 0).getTime();
                const tB = new Date(b.createdAt || 0).getTime();
                return tB - tA;
              });

              if (typeof window !== "undefined") {
                try {
                  sessionStorage.setItem(
                    `history_transactions_cache_${user.uid}`,
                    JSON.stringify({ data: merged.slice(0, 15), hasMore: snap.docs.length >= 15, timestamp: Date.now() })
                  );
                } catch {
                  // Ignore storage write error
                }
              }

              return merged;
            });

            setSelectedTx((currentSelected) => {
              if (!currentSelected) return null;
              const updated = snapshotList.find((t) => t.id === currentSelected.id || t.reference === currentSelected.reference);
              if (updated && (updated.status !== currentSelected.status || updated.totalCredited !== currentSelected.totalCredited)) {
                return updated;
              }
              return currentSelected;
            });

            if (snap.docs.length > 0) {
              setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
            }
            setHasMore(snap.docs.length >= 15);
            setLoading(false);
          },
          (error) => {
            console.warn("[ActivityLogContainer onSnapshot Main Warning]:", error?.message || error);
          }
        );

        // 2. Targeted listener for all pending transactions belonging to user (monitors older pages seamlessly)
        const qPending = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          where("status", "in", ["PENDING", "pending", "PROCESSING", "processing"])
        );

        unsubscribePending = onSnapshot(
          qPending,
          async (pendingSnap) => {
            const pendingDocsList: DocumentData[] = [];
            pendingSnap.forEach((docSnap) => pendingDocsList.push(docSnap));

            const docChangesList = pendingSnap.docChanges().map((c) => ({
              type: c.type,
              doc: c.doc,
            }));

            const { updatedPendingMap, removedDocIds, removedTxMap } =
              await processPendingDocChanges(pendingDocsList, docChangesList, (ref) => getDoc(ref));

            const currentTransactions = transactionsRef.current;
            const { hasChange, updatedList } = applyPendingTransactionsUpdate(
              currentTransactions,
              updatedPendingMap,
              removedDocIds,
              removedTxMap
            );

            if (hasChange) {
              setTransactions(updatedList);
              fetchMonthlyTotal();

              setSelectedTx((currentSelected) => {
                if (!currentSelected) return null;
                const matchInUpdated = updatedList.find(
                  (t) => t.id === currentSelected.id || t.reference === currentSelected.reference
                );
                if (
                  matchInUpdated &&
                  (matchInUpdated.status !== currentSelected.status ||
                    matchInUpdated.totalCredited !== currentSelected.totalCredited)
                ) {
                  return matchInUpdated;
                }
                return currentSelected;
              });

              if (typeof window !== "undefined") {
                try {
                  sessionStorage.setItem(
                    `history_transactions_cache_${user.uid}`,
                    JSON.stringify({
                      data: updatedList.slice(0, 15),
                      hasMore: hasMore,
                      timestamp: Date.now(),
                    })
                  );
                } catch {
                  // Ignore cache error
                }
              }
            }
          },
          (pError) => {
            console.warn("[ActivityLogContainer Pending Listener Warning]:", pError?.message || pError);
          }
        );
      } catch (err: any) {
        console.warn("[ActivityLogContainer Setup Listeners Exception]:", err?.message || err);
      }
    }

    const handleAppRefresh = () => {
      fetchInitialTransactions(true);
      fetchMonthlyTotal();
    };

    window.addEventListener("app-refresh", handleAppRefresh);
    return () => {
      window.removeEventListener("app-refresh", handleAppRefresh);
      if (unsubscribeMain) unsubscribeMain();
      if (unsubscribePending) unsubscribePending();
    };
  }, [user]);

  // Load more function with query cursors
  const handleLoadMore = async () => {
    if (!user || loadingMore || !hasMore || !lastVisibleDoc) return;

    try {
      setLoadingMore(true);
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        startAfter(lastVisibleDoc),
        limit(15)
      );

      const snap = await getDocs(q);
      const list: Transaction[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          ...data,
          id: docSnap.id,
          reference: data.reference || docSnap.id,
          type: data.type || "DEPOSIT",
          amount: Number(data.amount) || 0,
          currency: data.currency || "NGN",
          description: data.description || "",
          recipientName: data.recipientName || "",
          bankName: data.bankName || "",
          status: data.status || "PENDING",
          date: data.date || "",
          time: data.time || "",
          fee: Number(data.fee) || 0,
          vat: Number(data.vat) || 0,
          markup: Number(data.markup) || 0,
          totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
          totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
        });
      });

      setTransactions((prev) => [...prev, ...list]);
      if (snap.docs.length < 15) {
        setHasMore(false);
        setLastVisibleDoc(null);
      } else {
        setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(true);
      }
    } catch (err) {
      console.error("[HistoryPage Load More Exception]:", err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const getCategoryFromTx = (tx: Transaction) => {
    const t = (tx.type || "").toUpperCase();
    const c = (tx.category || "").toLowerCase();
    const d = (tx.description || "").toLowerCase();
    if (t === "DEPOSIT" || t === "CASHOUT" || t === "WALLET_FUNDING" || t === "VIRTUAL_ACCOUNT_DEPOSIT" || c === "deposit") return "deposit";
    if (t === "TRANSFER" || t === "WITHDRAWAL") return "transfer";
    if (t === "BILL_PAYMENT" || t === "AIRTIME" || t === "DATA" || t === "BILLS" || t === "CABLE" || t === "ELECTRICITY" || d.includes("airtime") || d.includes("data")) return "bills";
    if (t === "SWAP" || t === "CURRENCY_SWAP" || d.includes("swap") || d.includes("exchange")) return "swap";
    if (t === "CARD_FUND" || t === "CARD") return "card";
    return "all";
  };

  const filteredTransactions = transactions.filter((tx) => {
    const txCategory = getCategoryFromTx(tx);
    const matchesCategory = activeCategory === "all" || txCategory === activeCategory;
    const matchesCurrency = selectedCurrencyFilter === "ALL" || (tx.currency || "NGN") === selectedCurrencyFilter;
    const isPendingFunding = (tx.type === "WALLET_FUNDING" || tx.type === "DEPOSIT") && (tx.status === "PENDING" || tx.status === "pending");
    if (isPendingFunding) return false;

    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.recipientName && tx.recipientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      tx.type.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch && matchesCurrency;
  });

  const handleBackNav = () => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const hasReturnToFunding = urlParams.get("returnToFunding") === "true";
      const hasActiveSession = Boolean(sessionStorage.getItem("active_funding_session"));

      if (hasReturnToFunding || hasActiveSession) {
        router.push("/?fromHistoryReturn=true");
        return;
      }
    }
    // Safely navigate back to home page dashboard without popping history back into /auth/pin or /auth/login
    router.push("/");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto space-y-5"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackNav}
            className="w-10 h-10 rounded-full border border-gray-150 bg-white flex items-center justify-center text-gray-700 hover:text-black hover:border-gray-200 active:scale-95 transition-all duration-300 cursor-pointer shadow-none"
            title="Go Back"
          >
            <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
          </button>
          <div>
            <h2 className="font-hanken font-extrabold text-lg text-black leading-tight">Activity Log</h2>
            <p className="font-hanken text-[11px] text-gray-400 font-bold uppercase tracking-wider">Historical Transactions</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsStatementModalOpen(true)}
          className="px-3 py-1.5 rounded-xl border border-black/20 bg-black text-white hover:bg-gray-800 transition-all text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer flex-shrink-0 shadow-3xs active:scale-95"
          title="Statement of Account"
        >
          <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
          <span className="hidden min-[360px]:inline">Statement</span>
        </button>
      </div>

      {/* Summary Card: Total Fund Received This Month */}
      <div className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 text-white shadow-md relative overflow-hidden flex items-center justify-between">
        <div className="relative z-10">
          <p className="font-hanken text-[10px] font-extrabold text-emerald-200 uppercase tracking-widest flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">calendar_month</span>
            <span>Total Fund Received This Month</span>
          </p>
          <p className="font-mono text-xl sm:text-2xl font-black mt-1">
            ₦{monthlyCreditTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-100 shrink-0 border border-white/20">
          <span className="material-symbols-outlined text-[28px]">south_west</span>
        </div>
      </div>

      {/* Search Bar Input */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
          search
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search reference, recipient, or category..."
          className="w-full bg-white border border-black rounded-2xl pl-11 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Pill Filters Horizontal Drawer */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 -mx-margin-mobile px-margin-mobile select-none">
        {[
          { id: "all" as const, label: "All Logs" },
          { id: "deposit" as const, label: "Deposits" },
          { id: "transfer" as const, label: "Transfers" },
          { id: "bills" as const, label: "Bills Pay" },
          { id: "swap" as const, label: "Swaps" },
          { id: "card" as const, label: "Virtual Cards" }
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex-shrink-0 cursor-pointer shadow-sm border",
              activeCategory === cat.id
                ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-[0_2px_8px_rgba(252,122,0,0.15)]"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Currency Filter Row */}
      <div className="flex gap-2 select-none border-b border-gray-100 pb-2">
        {[
          { id: "ALL" as const, label: "All Currencies" },
          { id: "NGN" as const, label: "NGN (₦)" },
          { id: "USD" as const, label: "USD ($)" }
        ].map((cur) => (
          <button
            key={cur.id}
            onClick={() => setSelectedCurrencyFilter(cur.id)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border",
              selectedCurrencyFilter === cur.id
                ? "bg-black text-white border-black"
                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
            )}
          >
            {cur.label}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-full h-[72px] bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100" />
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-28" />
                    <div className="h-2 bg-gray-100 rounded w-16" />
                  </div>
                </div>
                <div className="space-y-2 text-right">
                  <div className="h-3.5 bg-gray-200 rounded w-16 ml-auto" />
                  <div className="h-2.5 bg-gray-100 rounded w-10 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <span className="material-symbols-outlined text-[48px] text-gray-300">receipt_long</span>
            <p className="font-hanken font-bold text-xs text-gray-400 uppercase tracking-widest">No matching activities</p>
            <p className="font-hanken text-[10px] text-gray-400">Refine search text or select another category filter.</p>
          </div>
        ) : (
          <>
            {filteredTransactions.map((tx) => {
              const isCredit = isCreditTransaction(tx);
              const displayAmount = getTransactionDisplayAmount(tx);
              return (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className={cn(
                    "w-full text-left relative overflow-hidden bg-white border rounded-2xl p-4 pl-5 flex items-center justify-between gap-3 active:scale-[0.99] transition-all cursor-pointer shadow-3xs",
                    isCredit
                      ? "bg-gradient-to-r from-emerald-500/[0.03] via-emerald-500/[0.005] to-white border-emerald-500/15 hover:border-emerald-500/35"
                      : "bg-gradient-to-r from-[#FC7A00]/[0.03] via-[#FC7A00]/[0.005] to-white border-[#FC7A00]/15 hover:border-[#FC7A00]/35"
                  )}
                >
                  {/* Side Accent Strip */}
                  <div
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-[4px]",
                      isCredit
                        ? "bg-gradient-to-b from-emerald-400 to-emerald-600"
                        : "bg-gradient-to-b from-[#FC7A00] to-[#FF9022]"
                    )}
                  />

                  <div className="flex items-center gap-3 min-w-0">
                    <TransactionIcon
                      type={tx.type}
                      description={tx.description}
                      recipientName={tx.recipientName}
                      bankName={tx.bankName}
                      className="w-10 h-10"
                    />

                    <div className="min-w-0">
                      <p className="font-hanken font-extrabold text-xs text-black leading-tight truncate">
                        {tx.description}
                      </p>
                      <p className="font-hanken text-[9px] text-gray-400 mt-1 font-semibold uppercase tracking-wider">
                        {formatTransactionDateTime(tx.createdAt, tx.date, tx.time).dateTime}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p
                      className={cn(
                        "font-mono text-xs min-[360px]:text-sm font-bold",
                        isCredit ? "text-emerald-600" : "text-black"
                      )}
                    >
                      {isCredit ? "+" : "-"}
                      {tx.currency === "NGN" ? "₦" : "$"}
                      {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>

                    {(() => {
                      const ledgerStatus = getTransactionLedgerStatus(tx);
                      return (
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest mt-1 uppercase border",
                            ledgerStatus.badgeBg,
                            ledgerStatus.badgeText,
                            ledgerStatus.badgeBorder
                          )}
                        >
                          {ledgerStatus.label}
                        </span>
                      );
                    })()}
                  </div>
                </button>
              );
            })}

            {loadingMore && (
              <div className="space-y-2.5 pt-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={`loading-more-${i}`}
                    className="w-full h-[72px] bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between animate-pulse"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100" />
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-28" />
                        <div className="h-2 bg-gray-100 rounded w-16" />
                      </div>
                    </div>
                    <div className="space-y-2 text-right">
                      <div className="h-3.5 bg-gray-200 rounded w-16 ml-auto" />
                      <div className="h-2.5 bg-gray-100 rounded w-10 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={handleLoadMore}
                  className="px-6 py-3.5 rounded-xl border border-[#FC7A00]/30 hover:border-[#FC7A00] bg-white text-[#FC7A00] text-xs font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center gap-2.5 shadow-3xs hover:shadow-xs disabled:opacity-60"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
                      <span>Fetching More History...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">expand_circle_down</span>
                      <span>Load More History</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedTx && (
          <TransactionReceipt transaction={selectedTx} onClose={() => setSelectedTx(null)} />
        )}
      </AnimatePresence>

      <StatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
      />
    </motion.div>
  );
};
