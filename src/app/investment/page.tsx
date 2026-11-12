"use client";

import React, { useState, useEffect } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteGuard } from "@/components/RouteGuard";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import BannerSlideshow from "@/components/BannerSlideshow";
import { SavingsPlanData, DEFAULT_SAVINGS_PLANS } from "@/lib/savings-plans-types";
import { InvestmentCalendarModal } from "@/components/investment/InvestmentCalendarModal";
import { ConfirmSavingsModal } from "@/components/investment/ConfirmSavingsModal";
import { EarlyCancelModal } from "@/components/investment/EarlyCancelModal";
import { InvestmentDetailsModal, ActiveInvestment } from "@/components/investment/InvestmentDetailsModal";
import { InvestmentPlanForm } from "@/components/investment/InvestmentPlanForm";
import { InvestmentHoldingsContainer } from "@/components/investment/InvestmentHoldingsContainer";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";

export default function InvestmentPage() {
  const { userData, user } = useAuth();
  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const currentPhoto = (userData?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  // DB-driven specs & Settings
  const [plans, setPlans] = useState<SavingsPlanData[]>(DEFAULT_SAVINGS_PLANS);
  const [penaltyRate, setPenaltyRate] = useState<number>(0.10);
  const [penaltyPolicyText, setPenaltyPolicyText] = useState<string>(
    "Early liquidation of locked savings before the target unlock date incurs a 10% penalty on principal. The remaining 90% balance will be instantly refunded to your wallet."
  );
  const [allowBonusInvestment, setAllowBonusInvestment] = useState<boolean>(true);

  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  // Holding Navigation & Modal States
  const [activeHoldingTab, setActiveHoldingTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "CLAIMED" | "CANCELLED">("ALL");
  const [selectedDetailInv, setSelectedDetailInv] = useState<ActiveInvestment | null>(null);

  // States for creation
  const [selectedPlanId, setSelectedPlanId] = useState<string>("target-savings");
  const [amountStr, setAmountStr] = useState<string>("");
  const [walletTypeSelected, setWalletTypeSelected] = useState<"MAIN" | "BONUS">("MAIN");

  // UNLOCK DURATION STATES ("WHEN DO YOU WANT TO UNLOCK YOUR SAVINGS")
  const [unlockMode, setUnlockMode] = useState<"MONTHS" | "YEARS" | "CUSTOM">("MONTHS");
  const [selectedMonth, setSelectedMonth] = useState<number>(3);
  const [selectedYear, setSelectedYear] = useState<number>(1);
  const [customMaturityDate, setCustomMaturityDate] = useState<string>("");

  // Active holdings
  const [investments, setInvestments] = useState<ActiveInvestment[]>([]);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [selectedCancelId, setSelectedCancelId] = useState<string>("");

  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [showCalendarModal, setShowCalendarModal] = useState<boolean>(false);

  // PIN Authorization Modal States
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinAction, setPinAction] = useState<"CREATE" | "CLAIM">("CREATE");
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0] || DEFAULT_SAVINGS_PLANS[0];

  // Sync unlock options when selected plan changes
  useEffect(() => {
    if (selectedPlan) {
      if (selectedPlan.allowMonths && Array.isArray(selectedPlan.monthOptions) && selectedPlan.monthOptions.length > 0) {
        setUnlockMode("MONTHS");
        setSelectedMonth(selectedPlan.monthOptions[0]);
      } else if (selectedPlan.allowYears && Array.isArray(selectedPlan.yearOptions) && selectedPlan.yearOptions.length > 0) {
        setUnlockMode("YEARS");
        setSelectedYear(selectedPlan.yearOptions[0]);
      } else if (selectedPlan.allowCustom) {
        setUnlockMode("CUSTOM");
      }
    }
  }, [selectedPlanId, selectedPlan]);

  // Compute calculated lock days and maturity date
  const getCalculatedMaturityDate = (): Date => {
    const date = new Date();
    if (unlockMode === "MONTHS") {
      date.setMonth(date.getMonth() + (selectedMonth || 1));
    } else if (unlockMode === "YEARS") {
      date.setFullYear(date.getFullYear() + (selectedYear || 1));
    } else if (unlockMode === "CUSTOM" && customMaturityDate) {
      return new Date(customMaturityDate);
    } else {
      date.setDate(date.getDate() + (selectedPlan?.defaultDurationDays || 30));
    }
    return date;
  };

  const calculatedMaturityDateObj = getCalculatedMaturityDate();

  const getCalculatedLockDays = (): number => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(calculatedMaturityDateObj);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  const calculatedLockDays = getCalculatedLockDays();

  // Load plans and records
  const loadInvestmentData = async () => {
    try {
      setIsLoadingPlans(true);
      setIsLoadingHistory(true);

      const [plansRes, settingsRes] = await Promise.all([
        fetch("/api/investments/plans"),
        fetch("/api/investments/settings")
      ]);

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        if (plansData.success && Array.isArray(plansData.plans) && plansData.plans.length > 0) {
          setPlans(plansData.plans);
          setSelectedPlanId(plansData.plans[0].id);
        }
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.success && settingsData.settings) {
          if (settingsData.settings.penaltyRate !== undefined) {
            setPenaltyRate(Number(settingsData.settings.penaltyRate));
          }
          if (settingsData.settings.penaltyPolicyText) {
            setPenaltyPolicyText(settingsData.settings.penaltyPolicyText);
          }
          if (settingsData.settings.allowBonusInvestment !== undefined) {
            setAllowBonusInvestment(Boolean(settingsData.settings.allowBonusInvestment));
          }
        }
      }
      setIsLoadingPlans(false);

      if (user) {
        const idToken = await user.getIdToken();
        const holdingsRes = await fetch("/api/investments", {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        if (holdingsRes.ok) {
          const holdingsData = await holdingsRes.json();
          if (holdingsData.success && Array.isArray(holdingsData.investments)) {
            setInvestments(holdingsData.investments);
          }
        }
      }
      setIsLoadingHistory(false);
    } catch (err) {
      console.error("Failed to load backend investment records:", err);
      setIsLoadingPlans(false);
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadInvestmentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const mainBalance = (userData?.balance as number) ?? 0;
  const bonusBalance = (userData?.bonusBalance as number) ?? 0;
  const userBalance = walletTypeSelected === "BONUS" ? bonusBalance : mainBalance;

  const activeInvestmentsList = investments.filter((i) => i.status === "ACTIVE");
  const totalActiveInvestmentBalance = activeInvestmentsList.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  const totalDailyIncome = activeInvestmentsList.reduce((sum, inv) => {
    const principal = Number(inv.amount) || 0;
    const rate = Number(inv.interestRate) || 0;
    const dailyReturn = (principal * rate) / 365;
    return sum + dailyReturn;
  }, 0);

  const getEstimatedReward = () => {
    const amt = parseFloat(amountStr) || 0;
    if (amt <= 0) return 0;

    const aprDecimal = (selectedPlan.apr || 10) / 100;
    const diffDays = calculatedLockDays;

    if (selectedPlan.interestType === "SIMPLE") {
      const reward = amt * aprDecimal * (diffDays / 365);
      return parseFloat(reward.toFixed(2));
    } else {
      const reward = amt * (Math.pow(1 + aprDecimal / 365, diffDays) - 1);
      return parseFloat(reward.toFixed(2));
    }
  };

  // Form Prevalidation
  const handlePrevalidate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amountStr);

    if (selectedPlan.isAmountRequired) {
      if (isNaN(amt) || amt <= 0) {
        toast.error("Please enter a valid investment amount");
        return;
      }

      if (amt < selectedPlan.minInvestment) {
        toast.error(`Minimum investment limit for ${selectedPlan.name} is ₦${selectedPlan.minInvestment.toLocaleString()}`);
        return;
      }

      if (amt > selectedPlan.maxInvestment) {
        toast.error(`Maximum investment limit for ${selectedPlan.name} is ₦${selectedPlan.maxInvestment.toLocaleString()}`);
        return;
      }

      if (amt > userBalance) {
        toast.error("Insufficient wallet balance for this investment amount");
        return;
      }
    }

    if (unlockMode === "CUSTOM") {
      if (!customMaturityDate) {
        toast.error("Please pick a custom unlock date from the calendar");
        return;
      }
      if (calculatedLockDays < selectedPlan.minCustomDays) {
        toast.error(`Custom lock duration must be at least ${selectedPlan.minCustomDays} days for this plan.`);
        return;
      }
      if (calculatedLockDays > selectedPlan.maxCustomDays) {
        toast.error(`Custom lock duration cannot exceed ${selectedPlan.maxCustomDays} days for this plan.`);
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLiquidating, setIsLiquidating] = useState<boolean>(false);

  // Trigger PIN prompt after rules confirmation
  const handleConfirmRulesAndPromptPin = () => {
    setShowConfirmModal(false);
    setPinAction("CREATE");
    setShowPinModal(true);
  };

  // Execute Creation with PIN / Biometric
  const handleExecuteInvestmentWithPin = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    setIsSubmitting(true);
    const amt = parseFloat(amountStr) || 0;

    try {
      if (!user) {
        toast.error("Authentication required.");
        setIsSubmitting(false);
        return;
      }

      const idToken = await user.getIdToken();
      const endpoint = selectedPlan.type === "SAVINGS" ? "/api/investments/savings" : "/api/investments/fixed-deposit";
      const idempotencyKey = `inv-${user.uid}-${Date.now()}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
          amount: amt,
          currency: "NGN",
          productId: selectedPlan.id,
          walletType: walletTypeSelected,
          durationDays: calculatedLockDays,
          idempotencyKey,
          pin,
          isBiometricAuthenticated,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Savings locked successfully under ${selectedPlan.name}!`);
        setShowPinModal(false);
        setAmountStr("");
        await loadInvestmentData();
      } else {
        toast.error(data.error || "Failed to establish savings lock.");
      }
    } catch (err) {
      console.error("Investment Error:", err);
      toast.error("Failed to process savings lock. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger PIN prompt for claim request
  const handleOpenClaimPinModal = (invId: string) => {
    setSelectedClaimId(invId);
    setPinAction("CLAIM");
    setShowPinModal(true);
  };

  // Execute Claim with PIN / Biometric
  const handleExecuteClaimWithPin = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    if (!selectedClaimId) return;
    setIsSubmitting(true);

    try {
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/investments/${selectedClaimId}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ pin, isBiometricAuthenticated }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message);
        setShowPinModal(false);
        setSelectedClaimId("");
        await loadInvestmentData();
      } else {
        toast.error(data.error || "Claim request submission failed.");
      }
    } catch {
      toast.error("Network error during payout claim execution.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Early Cancel Execution
  const handleEarlyCancel = async () => {
    if (!selectedCancelId) return;
    setIsLiquidating(true);

    try {
      if (!user) {
        toast.error("Authentication required.");
        setIsLiquidating(false);
        return;
      }

      const idToken = await user.getIdToken();

      const res = await fetch(`/api/investments/${selectedCancelId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Savings lock liquidated successfully!");
        setShowCancelModal(false);
        await loadInvestmentData();
      } else {
        toast.error(data.error || "Early cancellation request failed.");
      }
    } catch {
      toast.error("Network connection failure during early liquidation.");
    } finally {
      setIsLiquidating(false);
    }
  };

  return (
    <RouteGuard>
      <div className="min-h-dvh bg-background text-on-background pb-20">
        <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

        <main className="max-w-md mx-auto mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-16 text-black">
          {/* Header Title Section */}
          <div className="flex items-center gap-3 mb-5 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">
                trending_up
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-bodoni text-[18px] min-[375px]:text-[20px] font-bold tracking-tight text-black truncate">
                CHOOSE YOUR SAVINGS PLAN
              </h1>
              <p className="font-hanken text-[11px] text-gray-500 font-bold leading-none mt-1 truncate">
                Select a savings plan, unlock duration & earn high returns
              </p>
            </div>
          </div>

          <BannerSlideshow page="investment" />

          {/* Current Available Balance & Active Investment Portfolio Card */}
          <div className="bg-gradient-to-br from-[#111] to-[#222] rounded-[24px] p-5 text-white mb-6 border border-white/5 shadow-md animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="font-hanken text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Available {walletTypeSelected === "BONUS" ? "Bonus" : "Main"} Wallet Balance
                </p>
                <p className="font-bodoni text-[22px] font-bold mt-0.5 text-[#FC7A00]">
                  ₦{userBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-hanken text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Active Investment Balance
                </p>
                <p className="font-bodoni text-[22px] font-bold mt-0.5 text-emerald-400 font-mono">
                  ₦{totalActiveInvestmentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-[#FC7A00] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">trending_up</span>
                </div>
                <div>
                  <p className="font-hanken text-[10px] text-gray-300 font-bold uppercase">Estimated Daily Income</p>
                  <p className="font-hanken text-[13px] font-extrabold text-green-400 font-mono">
                    +₦{totalDailyIncome.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / day
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20">
                <span className="material-symbols-outlined text-[13px] text-green-400">
                  lock
                </span>
                <p className="font-hanken text-[9px] text-green-300 font-bold uppercase tracking-wider">
                  100% Secured
                </p>
              </div>
            </div>
          </div>

          {/* Form Create Investment Container */}
          <InvestmentPlanForm
            plans={plans}
            selectedPlanId={selectedPlanId}
            setSelectedPlanId={setSelectedPlanId}
            selectedPlan={selectedPlan}
            isLoadingPlans={isLoadingPlans}
            allowBonusInvestment={allowBonusInvestment}
            walletTypeSelected={walletTypeSelected}
            setWalletTypeSelected={setWalletTypeSelected}
            mainBalance={mainBalance}
            bonusBalance={bonusBalance}
            userBalance={userBalance}
            unlockMode={unlockMode}
            setUnlockMode={setUnlockMode}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            customMaturityDate={customMaturityDate}
            calculatedMaturityDateObj={calculatedMaturityDateObj}
            calculatedLockDays={calculatedLockDays}
            onOpenCalendar={() => {
              const minDays = selectedPlan.minCustomDays || 7;
              const initialDate = new Date();
              initialDate.setDate(initialDate.getDate() + minDays);
              setCalendarMonth(initialDate);
              setShowCalendarModal(true);
            }}
            amountStr={amountStr}
            setAmountStr={setAmountStr}
            getEstimatedReward={getEstimatedReward}
            onPrevalidate={handlePrevalidate}
          />

          {/* Active Vault & History Tab Section */}
          <InvestmentHoldingsContainer
            activeHoldingTab={activeHoldingTab}
            setActiveHoldingTab={setActiveHoldingTab}
            historyFilter={historyFilter}
            setHistoryFilter={setHistoryFilter}
            isLoadingHistory={isLoadingHistory}
            investments={investments}
            onSelectDetailInv={setSelectedDetailInv}
            onOpenClaimPinModal={handleOpenClaimPinModal}
            onOpenCancelModal={(invId) => {
              setSelectedCancelId(invId);
              setShowCancelModal(true);
            }}
          />
        </main>

        <BottomNav />

        {/* Locked Agreement Confirmation Modal */}
        <ConfirmSavingsModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          isSubmitting={isSubmitting}
          selectedPlan={selectedPlan}
          amountStr={amountStr}
          calculatedMaturityDateObj={calculatedMaturityDateObj}
          estimatedReward={getEstimatedReward()}
          penaltyRate={penaltyRate}
          onConfirm={handleConfirmRulesAndPromptPin}
        />

        {/* PIN Authorization Pad Modal */}
        <InvestmentPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          title={pinAction === "CREATE" ? "Authorize Savings Lock" : "Authorize Payout Request"}
          description={pinAction === "CREATE" ? "Enter 4-digit PIN or biometrics to confirm and lock funds." : "Enter 4-digit PIN or biometrics to submit payout request."}
          isSubmitting={isSubmitting}
          onPinSubmit={(pin, isBiometric) => {
            if (pinAction === "CREATE") {
              handleExecuteInvestmentWithPin(pin, isBiometric);
            } else {
              handleExecuteClaimWithPin(pin, isBiometric);
            }
          }}
        />

        {/* Penalty Warning Cancel Confirmation Modal */}
        <EarlyCancelModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          isLiquidating={isLiquidating}
          penaltyPolicyText={penaltyPolicyText}
          penaltyRate={penaltyRate}
          onConfirmCancel={handleEarlyCancel}
        />

        {/* Custom Calendar Picker Modal */}
        <InvestmentCalendarModal
          isOpen={showCalendarModal}
          onClose={() => setShowCalendarModal(false)}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          selectedPlan={selectedPlan}
          customMaturityDate={customMaturityDate}
          onSelectDate={(dateStr) => setCustomMaturityDate(dateStr)}
        />

        {/* FULL SCREEN INVESTMENT TRANSACTION DETAILS MODAL */}
        <InvestmentDetailsModal
          investment={selectedDetailInv}
          onClose={() => setSelectedDetailInv(null)}
          penaltyRate={penaltyRate}
        />
      </div>
    </RouteGuard>
  );
}
