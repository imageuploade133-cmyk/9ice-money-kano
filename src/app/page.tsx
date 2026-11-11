"use client";

import React, { useEffect, useState, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { BalanceCard } from "@/components/wallet/BalanceCard";
import { EmergencyBroadcastBanner } from "@/components/wallet/EmergencyBroadcastBanner";
import { RecentTransactions } from "@/components/wallet/RecentTransactions";
import { ServiceGrid } from "@/components/wallet/ServiceGrid";
import { Promotions } from "@/components/wallet/Promotions";
import { PullToRefreshOverlay } from "@/components/wallet/PullToRefreshOverlay";
import { PaymentVerificationOverlay } from "@/components/wallet/PaymentVerificationOverlay";
import { TransactionReceipt, Transaction } from "@/components/wallet/TransactionReceipt";
import { useAuth } from "@/lib/AuthContext";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFcm } from "@/hooks/useFcm";
import { AnimatePresence } from "framer-motion";

export default function Home() {
  const { userData, user, loading, updateUserData, setPinVerified } = useAuth();
  useFcm(); // Initialize FCM Web Push notifications and foreground listener
  const searchParams = useSearchParams();
  const router = useRouter();

  // Notification Receipt State Machine
  const [notificationTx, setNotificationTx] = useState<Transaction | null>(null);
  const [isNotificationReceiptFlow, setIsNotificationReceiptFlow] = useState(false);
  const isFetchingNotificationRef = useRef<string | null>(null);

  const fetchAndOpenNotificationTransaction = async (txRefToFetch: string) => {
    if (!txRefToFetch || isFetchingNotificationRef.current === txRefToFetch) return;
    isFetchingNotificationRef.current = txRefToFetch;

    // Clean query parameters from URL immediately
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    try {
      let idToken = "mock-token";
      const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
      if (!isMock && user) {
        try {
          idToken = await user.getIdToken();
        } catch (tokenErr) {
          console.error("Failed to retrieve ID token for notification receipt:", tokenErr);
        }
      }

      toast.loading("Fetching transaction details...");
      const res = await fetch(`/api/transactions/${encodeURIComponent(txRefToFetch)}`, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      const data = await res.json();
      toast.dismiss();

      if (res.ok && data.success && data.transaction) {
        setNotificationTx(data.transaction);
        setIsNotificationReceiptFlow(true);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("notification_receipt_active", "true");
        }
      } else if (res.status === 401) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("pending_notification_tx_ref", txRefToFetch);
        }
        toast.info("Please log in to view transaction details.");
      } else {
        toast.error(data.error || "You are not authorized to view this transaction.");
      }
    } catch (err) {
      console.error("[Notification Receipt Fetch Exception]:", err);
      toast.dismiss();
      toast.error("Failed to load transaction details.");
    } finally {
      isFetchingNotificationRef.current = null;
    }
  };

  const handleCloseNotificationReceipt = () => {
    setNotificationTx(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("notification_receipt_active");
      sessionStorage.removeItem("pending_notification_tx_ref");
    }

    if (isNotificationReceiptFlow) {
      setIsNotificationReceiptFlow(false);
      // Section 10, 11, 13, 14: Require Access PIN after leaving notification-opened receipt
      setPinVerified(false);
      router.push("/auth/pin?mode=notification_unlock");
    }
  };

  // Expose global callback and listen for deep-link or search parameter txRef
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__openNotificationTransaction = (ref: string) => {
        fetchAndOpenNotificationTransaction(ref);
      };
    }

    const txRefParam = searchParams.get("txRef") || searchParams.get("transactionReference") || searchParams.get("reference");
    const pendingRef = typeof window !== "undefined" ? sessionStorage.getItem("pending_notification_tx_ref") : null;

    const refToProcess = txRefParam || pendingRef;

    if (refToProcess && user && !loading) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("pending_notification_tx_ref");
      }
      fetchAndOpenNotificationTransaction(refToProcess);
    }
  }, [searchParams, user, loading]);

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [verifiedAmount, setVerifiedAmount] = useState(0);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Touch / Pull-To-Refresh States
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Safety fallback: Ensure page loading state NEVER stays stuck indefinitely
    const safetyTimer = setTimeout(() => {
      setIsPageLoading(false);
    }, 2000);

    if (!loading) {
      const timer = setTimeout(() => {
        setIsPageLoading(false);
      }, 500);
      return () => {
        clearTimeout(timer);
        clearTimeout(safetyTimer);
      };
    }

    return () => clearTimeout(safetyTimer);
  }, [loading]);

  useEffect(() => {
    if (user && typeof user.getIdToken === "function") {
      user.getIdToken().then((idToken) => {
        (window as any).firebaseUserToken = idToken;
      }).catch((err) => {
        console.error("Failed to populate firebaseUserToken globally:", err);
      });
    } else if (user) {
      (window as any).firebaseUserToken = "mock-token";
    }
  }, [user]);

  // Prevent background scrolling while any settlement verification overlay is shown
  useEffect(() => {
    if (verificationStatus !== "idle") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [verificationStatus]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !isRefreshing) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0 || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const distance = currentY - startY;

    if (distance > 0 && window.scrollY <= 0) {
      // Apply smooth mobile physical resistance curve; allowing pushing back up to cancel
      const dampedDistance = Math.max(0, Math.min(100, distance * 0.5));
      setPullDistance(dampedDistance);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (startY === 0 || isRefreshing) return;
    setStartY(0);

    if (pullDistance >= 50) {
      setIsRefreshing(true);
      setPullDistance(50);

      try {
        let idToken = "mock-token";
        const isMock = sessionStorage.getItem("mock") === "true";
        if (!isMock && user) {
          idToken = await user.getIdToken();
        }

        const res = await fetch("/api/wallets", {
          headers: {
            "Authorization": `Bearer ${idToken}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          window.dispatchEvent(new CustomEvent("app-refresh"));

          if (data.success && data.wallets?.NGN) {
            await updateUserData({
              balance: data.wallets.NGN.balance,
              bonusBalance: data.wallets.NGN.bonusBalance
            });
          }
          toast.success("Balances & activities updated successfully!");
        } else {
          toast.error("Refreshed with network error.");
        }
      } catch (err) {
        console.error("Refresh Error:", err);
        toast.error("Failed to sync wallet data.");
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const nameStr = (userData?.firstName || userData?.name || userData?.fullName || user?.displayName || "Captain") as string;
  const currentUser = {
    userName: nameStr.split(" ")[0].toUpperCase(),
    profileImage: user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M",
    balance: userData?.balance || 0,
    currency: "NGN",
  };

  // Capture and process Flutterwave callback parameters dynamically
  useEffect(() => {
    const transactionId = searchParams.get("transaction_id") || searchParams.get("transactionId");
    const status = searchParams.get("status");
    const txRef = searchParams.get("tx_ref") || searchParams.get("txRef");
    const verifyParam = searchParams.get("verify");

    if (transactionId || status === "successful" || status === "completed" || verifyParam === "flw" || verifyParam === "flw_success") {
      const verifyPayment = async () => {
        setVerificationStatus("verifying");
        toast.loading("Verifying Flutterwave transaction details...");

        try {
          if (transactionId) {
            let idToken = "mock-token";
            const isMock = sessionStorage.getItem("mock") === "true";
            if (!isMock && user) {
              try {
                idToken = await user.getIdToken();
              } catch (tokenErr) {
                console.error("Failed to retrieve client ID token:", tokenErr);
              }
            }

            const res = await fetch(`/api/flutterwave/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({ transactionId, txRef })
            });
            const data = await res.json();
            toast.dismiss();

            if (data.success) {
              if (data.duplicate) {
                setIsDuplicate(true);
                setVerificationStatus("success");
                toast.info("Transaction already processed.");
              } else {
                setIsDuplicate(false);
                setVerifiedAmount(data.fundedAmount || 0);
                setVerificationStatus("success");
                toast.success("Wallet successfully funded!");
              }
            } else {
              setVerifyMessage(data.error || "Verification was rejected by the gateway.");
              setVerificationStatus("error");
              toast.error("Wallet funding was unsuccessful.");
            }
          } else {
            setVerifiedAmount(0);
            setVerificationStatus("success");
            toast.dismiss();
            toast.success("Wallet successfully funded!");
          }
        } catch (err) {
          console.error("[Verify API Exception] Connection failure:", err);
          toast.dismiss();
          setVerifyMessage("Internal server communication error during verification.");
          setVerificationStatus("error");
          toast.error("An error occurred during verification.");
        }
      };

      verifyPayment();
    } else if (status === "cancelled") {
      toast.error("The transaction checkout flow was cancelled.");

      if (txRef) {
        const handleCancelCleanup = async () => {
          try {
            let idToken = "mock-token";
            const isMock = sessionStorage.getItem("mock") === "true";
            if (!isMock && user) {
              try {
                idToken = await user.getIdToken();
              } catch (tokenErr) {
                console.error("Failed to retrieve client ID token:", tokenErr);
              }
            }

            await fetch("/api/flutterwave/cancel", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
              },
              body: JSON.stringify({ txRef })
            });
          } catch (err) {
            console.error("[Cancel Cleanup Error]", err);
          } finally {
            router.replace("/");
          }
        };

        handleCancelCleanup();
      } else {
        router.replace("/");
      }
    }
  }, [searchParams, router, user]);

  const handleDismissSuccess = () => {
    setVerificationStatus("idle");
    router.replace("/");
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen flex flex-col justify-between"
    >
      <Header
        userName={currentUser.userName}
        profileImage={currentUser.profileImage}
        isLoading={isPageLoading}
      />

      {/* Floating Pull-To-Refresh Overlay */}
      <PullToRefreshOverlay
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />

      {/* Dynamic payment verification overlays */}
      <PaymentVerificationOverlay
        verificationStatus={verificationStatus}
        isDuplicate={isDuplicate}
        verifiedAmount={verifiedAmount}
        verifyMessage={verifyMessage}
        onDismiss={handleDismissSuccess}
      />

      <main className="mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-24 min-[375px]:pb-32">
        <EmergencyBroadcastBanner />
        <BalanceCard
          balance={currentUser.balance}
          currency={currentUser.currency}
          isLoading={isPageLoading}
        />
        <RecentTransactions isLoading={isPageLoading} />
        <ServiceGrid />
        <Promotions />
      </main>

      <AnimatePresence>
        {notificationTx && (
          <TransactionReceipt
            transaction={notificationTx}
            onClose={handleCloseNotificationReceipt}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
