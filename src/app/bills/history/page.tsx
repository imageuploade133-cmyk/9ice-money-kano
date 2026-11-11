"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import { TransactionReceipt, Transaction } from "@/components/wallet/TransactionReceipt";
import { TransactionIcon } from "@/components/wallet/TransactionIcon";
import { formatTransactionDateTime } from "@/lib/date-utils";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import Link from "next/link";
import { toast } from "sonner";
import {
  getTransactionLedgerStatus,
  isCreditTransaction,
  getTransactionDisplayAmount
} from "@/lib/transaction-status-normalizer";

const BILL_TYPES = ["BILL_PAYMENT", "AIRTIME", "DATA", "BILLS", "CABLE", "ELECTRICITY", "WAEC", "BETTING", "UTILITY"];

export default function BillsHistoryPage() {
  const { userData, user } = useAuth();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "airtime" | "data" | "cable" | "electricity" | "waec">("all");
  const hasPushedState = React.useRef(false);

  // Total Bill Spent This Month state
  const [monthlyBillSpentTotal, setMonthlyBillSpentTotal] = useState<number>(0);

  // Pagination states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Sync state with browser back history for receipt drawer
  React.useEffect(() => {
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

  // Fetch Monthly Bill Spent Total
  useEffect(() => {
    if (!user) return;
    const fetchMonthlyBillSpent = async () => {
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
          const typeUpper = (data.type || "").toUpperCase();
          const descLower = (data.description || "").toLowerCase();
          const statusUpper = (data.status || "").toUpperCase();
          const isSuccess = statusUpper === "SUCCESS" || statusUpper === "COMPLETED";

          const isBill =
            BILL_TYPES.includes(typeUpper) ||
            descLower.includes("airtime") ||
            descLower.includes("data") ||
            descLower.includes("recharge") ||
            descLower.includes("cable") ||
            descLower.includes("electricity") ||
            descLower.includes("waec") ||
            descLower.includes("meter") ||
            descLower.includes("betting") ||
            descLower.includes("vtu");

          if (isSuccess && isBill && !isCreditTransaction({ ...data } as Transaction)) {
            total += getTransactionDisplayAmount({ ...data } as Transaction);
          }
        });

        setMonthlyBillSpentTotal(total);
      } catch (err) {
        console.warn("[Monthly Bill Spent Fetch Warning]:", err);
      }
    };

    fetchMonthlyBillSpent();
  }, [user]);

  // Initial secure paginated loading of bill transactions
  useEffect(() => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock || !user) {
      setTransactions([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    const fetchInitialBillsHistory = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(50)
        );

        const snap = await getDocs(q);
        const list: Transaction[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const typeUpper = (data.type || "").toUpperCase();
          const descLower = (data.description || "").toLowerCase();
          const isNonBillType = ["DEPOSIT", "TRANSFER", "WITHDRAWAL", "CASHOUT", "CARD_ISSUANCE", "CARD_FUND", "SWAP", "CURRENCY_SWAP", "REFUND"].includes(typeUpper);
          const isBill =
            !isNonBillType &&
            (BILL_TYPES.includes(typeUpper) ||
            descLower.includes("airtime") ||
            descLower.includes("data") ||
            descLower.includes("recharge") ||
            descLower.includes("cable") ||
            descLower.includes("electricity") ||
            descLower.includes("waec") ||
            descLower.includes("meter") ||
            descLower.includes("betting") ||
            descLower.includes("vtu"));

          if (isBill) {
            list.push({
              ...data,
              id: docSnap.id,
              reference: data.reference || docSnap.id,
              type: data.type || "BILL_PAYMENT",
              amount: Number(data.amount) || 0,
              currency: data.currency || "NGN",
              description: data.description || "",
              recipientName: data.recipientName || "",
              bankName: data.bankName || "",
              status: data.status || "SUCCESS",
              date: data.date || "",
              time: data.time || "",
              fee: Number(data.fee) || 0,
              vat: Number(data.vat) || 0,
              markup: Number(data.markup) || 0,
              totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
              totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
            });
          }
        });

        setTransactions(list);
        if (list.length === 0) {
          toast.info("No bill history");
        }

        if (snap.docs.length < 50) {
          setHasMore(false);
        } else {
          setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
          setHasMore(true);
        }
      } catch (err) {
        console.error("[BillsHistoryPage Initial Load Exception]:", err);
        setTransactions([]);
        setHasMore(false);
        toast.info("No bill history");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialBillsHistory();
  }, [user]);

  // Load more function
  const handleLoadMore = async () => {
    if (!user || loadingMore || !hasMore || !lastVisibleDoc) return;

    try {
      setLoadingMore(true);
      const q = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        startAfter(lastVisibleDoc),
        limit(50)
      );

      const snap = await getDocs(q);
      const list: Transaction[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const typeUpper = (data.type || "").toUpperCase();
        const descLower = (data.description || "").toLowerCase();
        const isBill =
          BILL_TYPES.includes(typeUpper) ||
          descLower.includes("airtime") ||
          descLower.includes("data") ||
          descLower.includes("recharge") ||
          descLower.includes("cable") ||
          descLower.includes("electricity") ||
          descLower.includes("waec") ||
          descLower.includes("meter") ||
          descLower.includes("betting") ||
          descLower.includes("vtu");

        if (isBill) {
          list.push({
            ...data,
            id: docSnap.id,
            reference: data.reference || docSnap.id,
            type: data.type || "BILL_PAYMENT",
            amount: Number(data.amount) || 0,
            currency: data.currency || "NGN",
            description: data.description || "",
            recipientName: data.recipientName || "",
            bankName: data.bankName || "",
            status: data.status || "SUCCESS",
            date: data.date || "",
            time: data.time || "",
            fee: Number(data.fee) || 0,
            vat: Number(data.vat) || 0,
            markup: Number(data.markup) || 0,
            totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
            totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
          });
        }
      });

      if (list.length === 0) {
        toast.info("No more bill history");
      }

      setTransactions((prev) => [...prev, ...list]);
      if (snap.docs.length < 50) {
        setHasMore(false);
        setLastVisibleDoc(null);
      } else {
        setLastVisibleDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(true);
      }
    } catch (err) {
      console.error("[BillsHistoryPage Load More Exception]:", err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const currentPhoto = (userData?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  const getSubCategoryFromTx = (tx: Transaction) => {
    const t = (tx.type || "").toUpperCase();
    const d = (tx.description || "").toLowerCase();
    if (t === "AIRTIME" || d.includes("airtime") || d.includes("recharge")) return "airtime";
    if (t === "DATA" || d.includes("data") || d.includes("sme") || d.includes("gig")) return "data";
    if (t === "CABLE" || d.includes("dstv") || d.includes("gotv") || d.includes("startimes")) return "cable";
    if (t === "ELECTRICITY" || t === "UTILITY" || d.includes("electricity") || d.includes("meter")) return "electricity";
    if (t === "WAEC" || d.includes("waec")) return "waec";
    return "all";
  };

  const filteredTransactions = transactions.filter((tx) => {
    const txSubCategory = getSubCategoryFromTx(tx);
    const matchesCategory = activeCategory === "all" || txSubCategory === activeCategory;
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.recipientName && tx.recipientName.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <>
      <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

      <main className="w-full max-w-md mx-auto mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-28 min-[375px]:pb-32 text-black overflow-x-hidden">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2.5 w-full">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                onClick={() => { triggerHaptic(); window.history.back(); }}
                className="w-10 h-10 rounded-full border border-gray-150 bg-white flex items-center justify-center text-gray-700 hover:text-black hover:border-gray-200 active:scale-95 transition-all duration-300 cursor-pointer shadow-none flex-shrink-0"
                title="Go Back"
              >
                <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="font-hanken font-extrabold text-base min-[360px]:text-lg text-black leading-tight truncate">Bills History</h2>
                <p className="font-hanken text-[10px] min-[360px]:text-[11px] text-gray-400 font-bold uppercase tracking-wider truncate">Airtime, Data & Utility Logs</p>
              </div>
            </div>

            <Link
              href="/bills"
              className="px-3 py-2 rounded-xl border border-[#FC7A00]/30 bg-[#FC7A00]/10 text-[#FC7A00] font-black text-xs uppercase tracking-wider hover:bg-[#FC7A00] hover:text-white transition-all flex items-center gap-1 cursor-pointer flex-shrink-0 shadow-3xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">payments</span>
              <span className="hidden min-[340px]:inline">Pay Bills</span>
            </Link>
          </div>

          {/* Summary Card: Total Bill Spent This Month */}
          <div className="w-full p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 text-white shadow-md relative overflow-hidden flex items-center justify-between gap-3">
            <div className="relative z-10 min-w-0 flex-1">
              <p className="font-hanken text-[10px] font-extrabold text-orange-100 uppercase tracking-widest flex items-center gap-1 truncate">
                <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                <span className="truncate">Total Bill Spent This Month</span>
              </p>
              <p className="font-mono text-lg sm:text-2xl font-black mt-1 truncate">
                ₦{monthlyBillSpentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-orange-100 shrink-0 border border-white/20">
              <span className="material-symbols-outlined text-[24px] sm:text-[28px]">payments</span>
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
              placeholder="Search phone number, provider, or transaction ref..."
              className="w-full bg-white border border-black rounded-2xl pl-11 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Pill Tabs Horizontal Drawer */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 -mx-margin-mobile px-margin-mobile select-none">
            {[
              { id: "all" as const, label: "All Bills" },
              { id: "airtime" as const, label: "Airtime" },
              { id: "data" as const, label: "Mobile Data" },
              { id: "cable" as const, label: "Cable TV" },
              { id: "electricity" as const, label: "Electricity" },
              { id: "waec" as const, label: "WAEC Pins" }
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
                <p className="font-hanken font-bold text-xs text-gray-400 uppercase tracking-widest">No bill logs found</p>
                <p className="font-hanken text-[10px] text-gray-400">Try refining search text or select another category filter.</p>
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
                        "w-full text-left relative overflow-hidden bg-white border rounded-2xl p-3.5 sm:p-4 pl-4 sm:pl-5 flex items-center justify-between gap-2.5 sm:gap-3 active:scale-[0.99] transition-all cursor-pointer shadow-3xs",
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

                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        <TransactionIcon
                          type={tx.type}
                          description={tx.description}
                          recipientName={tx.recipientName}
                          bankName={tx.bankName}
                          className="w-9 h-9 sm:w-10 sm:h-10 shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="font-hanken font-extrabold text-xs text-black leading-tight truncate">
                            {tx.description}
                          </p>
                          <p className="font-hanken text-[9px] text-gray-400 mt-1 font-semibold uppercase tracking-wider truncate">
                            {formatTransactionDateTime(tx.createdAt, tx.date, tx.time).dateTime}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={cn(
                            "font-mono text-xs sm:text-sm font-bold",
                            isCredit ? "text-emerald-600" : "text-black"
                          )}
                        >
                          {isCredit ? "+" : "-"}₦{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        key={`loading-more-bills-${i}`}
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

                {hasMore && filteredTransactions.length > 0 && (
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
                          <span>Fetching More Bills...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">expand_circle_down</span>
                          <span>Load More Bills History</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {selectedTx && (
          <TransactionReceipt transaction={selectedTx} onClose={() => setSelectedTx(null)} />
        )}
      </AnimatePresence>

      <BottomNav />
    </>
  );
}
