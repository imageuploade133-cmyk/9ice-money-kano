"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TransactionReceipt, Transaction } from "./TransactionReceipt";
import { TransactionIcon } from "./TransactionIcon";
import { formatTransactionDateTime } from "@/lib/date-utils";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { collection, query, where, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";
import { getTransactionLedgerStatus, isCreditTransaction, getTransactionDisplayAmount } from "@/lib/transaction-status-normalizer";

interface QuickActivityFeedProps {
  isLoading?: boolean;
}

const RECENT_TX_CACHE_KEY = "recent_transactions_cache";
const RECENT_TX_TTL_MS = 3 * 60 * 1000;

export const QuickActivityFeed: React.FC<QuickActivityFeedProps> = ({ isLoading: propIsLoading }) => {
  const { user } = useAuth();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const hasPushedState = useRef(false);

  // Safety fallback: Guarantee loading skeleton state NEVER remains stuck longer than 2.5 seconds
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);
    return () => clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    const checkVisibility = () => {
      const saved = sessionStorage.getItem("balance_visible");
      if (saved !== null) {
        setIsBalanceVisible(saved === "true");
      }
    };

    checkVisibility();

    window.addEventListener("balance_visibility_changed", checkVisibility);
    return () => {
      window.removeEventListener("balance_visibility_changed", checkVisibility);
    };
  }, []);

  const fetchRecentTransactions = async (forceRefresh = false) => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock || !user) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    if (!forceRefresh && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`${RECENT_TX_CACHE_KEY}_${user.uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.data) && Date.now() - parsed.timestamp < RECENT_TX_TTL_MS) {
            setTransactions(parsed.data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall back to query
      }
    }

    try {
      setLoading(true);

      let snapshot;
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(15)
        );
        snapshot = await getDocs(q);
      } catch (primaryErr) {
        console.warn("[QuickActivityFeed] Primary indexed query failed, trying unindexed fallback query:", primaryErr);
        try {
          const fallbackQ = query(
            collection(db, "transactions"),
            where("userId", "==", user.uid),
            limit(15)
          );
          snapshot = await getDocs(fallbackQ);
        } catch (fallbackErr) {
          console.error("[QuickActivityFeed] Fallback query error:", fallbackErr);
        }
      }

      const list: Transaction[] = [];
      if (snapshot && !snapshot.empty) {
        snapshot.forEach((docSnap) => {
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
            status: data.status || "SUCCESS",
            date: data.date || "",
            time: data.time || "",
            fee: Number(data.fee) || 0,
            vat: Number(data.vat) || 0,
            markup: Number(data.markup) || 0,
            totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
            totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
          } as Transaction);
        });

        // Client-side sort by createdAt as fallback if index was missing
        list.sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
      }

      setTransactions(list);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            `${RECENT_TX_CACHE_KEY}_${user.uid}`,
            JSON.stringify({ data: list, timestamp: Date.now() })
          );
        } catch {
          // Ignore storage write errors
        }
      }
    } catch (error) {
      console.error("[QuickActivityFeed Query Error]:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentTransactions();

    let unsubscribe: (() => void) | null = null;
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";

    if (!isMock && user) {
      try {
        const q = query(
          collection(db, "transactions"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(15)
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const list: Transaction[] = [];
            snapshot.forEach((docSnap) => {
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
                status: data.status || "SUCCESS",
                date: data.date || "",
                time: data.time || "",
                fee: Number(data.fee) || 0,
                vat: Number(data.vat) || 0,
                markup: Number(data.markup) || 0,
                totalDebited: data.totalDebited !== undefined && data.totalDebited !== null ? Number(data.totalDebited) : undefined,
                totalCredited: data.totalCredited !== undefined && data.totalCredited !== null ? Number(data.totalCredited) : undefined,
              } as Transaction);
            });

            setTransactions(list);
            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem(
                  `${RECENT_TX_CACHE_KEY}_${user.uid}`,
                  JSON.stringify({ data: list, timestamp: Date.now() })
                );
              } catch {
                // Ignore cache write errors
              }
            }
            setLoading(false);
          },
          (error) => {
            console.warn("[QuickActivityFeed onSnapshot Warning]:", error?.message || error);
          }
        );
      } catch (err: any) {
        console.warn("[QuickActivityFeed Listener Exception]:", err?.message || err);
      }
    }

    const handleAppRefresh = () => {
      fetchRecentTransactions(true);
    };

    window.addEventListener("app-refresh", handleAppRefresh);
    return () => {
      window.removeEventListener("app-refresh", handleAppRefresh);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]);

  useEffect(() => {
    if (selectedTx) {
      window.history.pushState({ receiptOpen: true }, "");
      hasPushedState.current = true;

      const handlePopState = (e: PopStateEvent) => {
        if (e.state && e.state.receiptOpen) {
          hasPushedState.current = false;
          setSelectedTx(null);
        }
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

  return (
    <section className="mb-stack-lg p-3 min-[360px]:p-3.5 bg-white/95 border border-gray-200/90 rounded-[20px] min-[360px]:rounded-[24px] shadow-3xs space-y-2.5 transition-all">
      {/* Header section */}
      <div className="flex justify-between items-center px-0.5">
        <div>
          <h3 className="font-headline-md text-[13px] min-[360px]:text-[14px] min-[390px]:text-[15px] text-gray-900 font-bold tracking-tight">
            Quick Activity
          </h3>
          <p className="font-hanken text-[8px] min-[360px]:text-[8.5px] text-gray-400 font-extrabold uppercase tracking-wider mt-0.5">
            Real-time ledger feeds
          </p>
        </div>
        {isBalanceVisible && (
          <Link
            href="/history"
            className="font-label-sm text-[10px] min-[360px]:text-[11px] text-[#FC7A00] font-black hover:brightness-110 flex items-center gap-0.5 transition-all"
          >
            See All
            <span className="material-symbols-outlined text-[13px] min-[360px]:text-[14px] font-bold">arrow_forward</span>
          </Link>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!isBalanceVisible ? (
          <motion.div
            key="hidden-activity"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 bg-gray-50/80 border border-dashed border-gray-200 rounded-[16px] text-center space-y-1.5 select-none"
          >
            <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FC7A00] mx-auto">
              <span className="material-symbols-outlined text-[16px]">visibility_off</span>
            </div>
            <p className="font-hanken font-bold text-[11px] text-gray-700">Quick Activity Hidden</p>
            <p className="font-hanken text-[9.5px] text-gray-400 max-w-xs mx-auto">
              Click the eye icon on your balance card above to reveal your real-time ledger feed.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="visible-activity"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {(propIsLoading || loading) ? (
              [1, 2].map((i) => (
                <div
                  key={i}
                  className="w-full relative overflow-hidden rounded-[16px] p-2.5 min-[360px]:p-3 flex items-center justify-between gap-2 bg-gray-50/50 border border-gray-100 shadow-xs"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3.5px] bg-gray-200 skeleton-shimmer" />
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8.5 h-8.5 rounded-full skeleton-shimmer flex-shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-28" />
                      <div className="h-2.5 bg-gray-100 rounded skeleton-shimmer w-16" />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1.5">
                    <div className="h-3 bg-gray-200 rounded skeleton-shimmer w-14 ml-auto" />
                    <div className="h-3.5 bg-gray-100 rounded-full skeleton-shimmer w-10 ml-auto" />
                  </div>
                </div>
              ))
            ) : (
              transactions
                .filter((tx) => {
                  const isPendingFunding = (tx.type === "WALLET_FUNDING" || tx.type === "DEPOSIT") && (tx.status === "PENDING" || tx.status === "pending");
                  return !isPendingFunding;
                })
                .slice(0, 3)
                .map((tx) => {
                  const isCredit = isCreditTransaction(tx);
                  const displayAmount = getTransactionDisplayAmount(tx);

                  return (
                    <motion.button
                      key={tx.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedTx(tx)}
                      className={cn(
                        "w-full text-left relative overflow-hidden rounded-[16px] p-2.5 min-[360px]:p-3 flex items-center justify-between gap-2 premium-gradient-border transition-all cursor-pointer shadow-xs",
                        isCredit
                          ? "bg-gradient-to-r from-emerald-500/[0.04] via-emerald-500/[0.01] to-white border-emerald-500/15 hover:border-emerald-500/35 hover:shadow-sm"
                          : "bg-gradient-to-r from-[#FC7A00]/[0.04] via-[#FC7A00]/[0.01] to-white border-[#FC7A00]/15 hover:border-[#FC7A00]/35 hover:shadow-sm"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute left-0 top-0 bottom-0 w-[3.5px]",
                          isCredit
                            ? "bg-gradient-to-b from-[#07B038] via-emerald-500 to-[#034A17]"
                            : "bg-gradient-to-b from-[#FC7A00] via-[#FF9E40] to-[#B35200]"
                        )}
                      />

                      <div className="flex items-center gap-2 min-[360px]:gap-2.5 min-w-0 flex-1">
                        <TransactionIcon
                          type={tx.type}
                          description={tx.description}
                          recipientName={tx.recipientName}
                          bankName={tx.bankName}
                          className="w-8.5 h-8.5 min-[360px]:w-9.5 min-[360px]:h-9.5 flex-shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="font-hanken font-extrabold text-[11px] min-[360px]:text-[12px] text-gray-900 leading-tight truncate max-w-[130px] min-[360px]:max-w-[170px] min-[390px]:max-w-none">
                            {tx.description}
                          </p>
                          {(() => {
                            const dt = formatTransactionDateTime(tx.createdAt, tx.date, tx.time);
                            return (
                              <p className="font-hanken text-[8.5px] min-[360px]:text-[9px] text-gray-400 mt-0.5 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                                <span>{dt.date}</span>
                                <span className="w-0.5 h-0.5 rounded-full bg-gray-300 flex-shrink-0" />
                                <span>{dt.time}</span>
                              </p>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p
                          className={cn(
                            "font-mono text-[11.5px] min-[360px]:text-[12.5px] min-[390px]:text-[13.5px] font-black tracking-tight",
                            isCredit ? "text-emerald-600" : "text-gray-950"
                          )}
                        >
                          {isCredit ? "+" : "-"}
                          ₦{displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>

                        {(() => {
                          const ledgerStatus = getTransactionLedgerStatus(tx);
                          return (
                            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-150 rounded-full px-1.5 py-0.2 mt-0.5 shadow-3xs">
                              <span className={cn("w-1 h-1 rounded-full animate-pulse", ledgerStatus.dotBg)} />
                              <span className="font-hanken text-[7px] min-[360px]:text-[7.5px] font-black uppercase tracking-wider text-gray-500">
                                {ledgerStatus.label}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </motion.button>
                  );
                })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTx && (
          <TransactionReceipt transaction={selectedTx} onClose={() => setSelectedTx(null)} />
        )}
      </AnimatePresence>
    </section>
  );
};
