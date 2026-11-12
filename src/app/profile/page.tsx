"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { Header } from "@/components/layout/Header";
import { LogoutDrawer } from "@/components/layout/LogoutDrawer";
import { useRouter } from "next/navigation";
import { KycVerificationDrawer } from "@/components/profile/KycVerificationDrawer";
import { handleAppSignOut } from "@/lib/logout-util";

import { ProfileHeaderSection } from "@/components/profile/ProfileHeaderSection";
import { ReferralSection } from "@/components/profile/ReferralSection";
import { KycStatusSection } from "@/components/profile/KycStatusSection";
import { SecuritySettingsSection } from "@/components/profile/SecuritySettingsSection";
import { registerBiometricCredential, getBiometricLabel, authenticateBiometricDetailed } from "@/lib/biometrics-util";
import { TransferLimitsSection } from "@/components/profile/TransferLimitsSection";
import { ChangePinSection } from "@/components/profile/ChangePinSection";
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";
import { PhoneNumberSection } from "@/components/profile/PhoneNumberSection";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";

export default function ProfilePage() {
  const { userData, user, loading, updateUserData } = useAuth();
  const router = useRouter();
  const [isKycDrawerOpen, setIsKycDrawerOpen] = useState(false);

  const [isProfileLoading, setIsProfileLoading] = useState(true);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        setIsProfileLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Basic User Information
  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const userEmail = (userData?.email || user?.email || "captain@example.com") as string;
  const currentPhoto = (userData?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  // Cache user token securely for the drawers to consume
  useEffect(() => {
    if (user && typeof user.getIdToken === "function") {
      user.getIdToken().then((idToken) => {
        (window as any).firebaseUserToken = idToken;
      }).catch((err) => {
        console.error("Failed to retrieve token:", err);
      });
    } else if (user) {
      (window as any).firebaseUserToken = "mock-token";
    }
  }, [user]);

  // Interactive KYC flow states
  const [staticAccount, setStaticAccount] = useState<{
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);

  // Modal / Drawer States
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletePinModalOpen, setIsDeletePinModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Security Toggles State
  const isPinRequired = userData?.isPinRequired !== false;
  const isFaceIdEnabled = userData?.isFaceIdEnabled === true;
  const is2faOtpEnabled = userData?.is2faOtpEnabled === true;
  const isBiometricLoginEnabled = userData?.isBiometricLoginEnabled === true;
  const isBiometricTransferEnabled = userData?.isBiometricTransferEnabled === true;
  const dailyLimit = userData?.dailyLimit ?? 500000;

  // Resolve or retrieve the permanent static account details if verified
  const loadStaticAccount = async () => {
    if (!user) return;
    const isMock = sessionStorage.getItem("mock") === "true";
    if (isMock) {
      setStaticAccount({
        bankName: "Wema Bank",
        accountNumber: "9921473281",
        accountName: `${userName.toUpperCase()}`,
      });
      return;
    }

    setLoadingAccount(true);
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

        if (parsedAccount.accountNumber) {
          setStaticAccount(parsedAccount);
        }
      }
    } catch (err) {
      console.error("Error loading permanent account from Firestore:", err);
    } finally {
      setLoadingAccount(false);
    }
  };

  useEffect(() => {
    if (user && userData?.kycStatus === "VERIFIED") {
      loadStaticAccount();
    } else {
      setStaticAccount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userData?.kycStatus]);

  const handleTogglePinRequired = async () => {
    try {
      const targetState = !isPinRequired;
      await updateUserData({ isPinRequired: targetState });
      toast.success(targetState ? "PIN Authentication Enabled" : "PIN Authentication Disabled");
    } catch {
      toast.error("Failed to update PIN state");
    }
  };

  const handleToggleFaceId = async () => {
    try {
      const targetState = !isFaceIdEnabled;
      await updateUserData({ isFaceIdEnabled: targetState });
      toast.success(targetState ? "Biometric FaceID Transfer Enabled" : "Biometric FaceID Transfer Disabled");
    } catch {
      toast.error("Failed to update FaceID state");
    }
  };

  const handleToggle2faOtp = async (enteredPin: string): Promise<boolean> => {
    try {
      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      // Verify 4-digit Access PIN first
      const verifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin: enteredPin }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Invalid Access PIN.");
        return false;
      }

      const targetState = !is2faOtpEnabled;
      await updateUserData({ is2faOtpEnabled: targetState });
      toast.success(targetState ? "2FA Login OTP Verification Enabled! 🛡️" : "2FA Login OTP Verification Disabled");
      return true;
    } catch {
      toast.error("Failed to update 2FA state");
      return false;
    }
  };

  const handleToggleBiometricLogin = async (enteredPin: string): Promise<boolean> => {
    try {
      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      const verifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin: enteredPin }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Invalid Access PIN.");
        return false;
      }

      const bioLabel = getBiometricLabel();
      const targetState = !isBiometricLoginEnabled;

      if (targetState) {
        triggerHaptic();
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate([100, 50, 100]);
        }
        toast.loading(`Scan ${bioLabel} sensor to authorize enablement...`);
        const authRes = await authenticateBiometricDetailed(`Enable ${bioLabel} Login`);
        toast.dismiss();

        if (!authRes.success) {
          if (authRes.cancelled) {
            toast.info(`${bioLabel} verification cancelled. Biometrics remained disabled.`);
          } else {
            toast.error(authRes.message || `${bioLabel} verification failed.`);
          }
          return false;
        }

        const regResult = await registerBiometricCredential(userEmail);
        if (!regResult.success) {
          toast.error(regResult.message || `${bioLabel} registration failed.`);
          return false;
        }
      }

      await updateUserData({ isBiometricLoginEnabled: targetState, isFaceIdEnabled: targetState });
      toast.success(targetState ? `${bioLabel} Login Enabled! 🔓` : `${bioLabel} Login Disabled`);
      return true;
    } catch {
      toast.error("Failed to update Biometric Login state");
      return false;
    }
  };

  const handleToggleBiometricTransfer = async (enteredPin: string): Promise<boolean> => {
    try {
      let idToken = "";
      if (user) {
        idToken = await user.getIdToken();
      }

      const verifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin: enteredPin }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Invalid Access PIN.");
        return false;
      }

      const bioLabel = getBiometricLabel();
      const targetState = !isBiometricTransferEnabled;

      if (targetState) {
        triggerHaptic();
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate([100, 50, 100]);
        }
        toast.loading(`Scan ${bioLabel} sensor to authorize enablement...`);
        const authRes = await authenticateBiometricDetailed(`Enable ${bioLabel} Transfers`);
        toast.dismiss();

        if (!authRes.success) {
          if (authRes.cancelled) {
            toast.info(`${bioLabel} verification cancelled. Biometrics remained disabled.`);
          } else {
            toast.error(authRes.message || `${bioLabel} verification failed.`);
          }
          return false;
        }

        const regResult = await registerBiometricCredential(userEmail);
        if (!regResult.success) {
          toast.error(regResult.message || `${bioLabel} registration failed.`);
          return false;
        }
      }

      await updateUserData({ isBiometricTransferEnabled: targetState });
      toast.success(targetState ? `${bioLabel} Transfer Enabled! ⚡` : `${bioLabel} Transfer Disabled`);
      return true;
    } catch {
      toast.error("Failed to update Biometric Transfer state");
      return false;
    }
  };

  const handleLogoutConfirm = async () => {
    setIsLogoutOpen(false);
    await handleAppSignOut(router);
  };

  const handleOpenDeletePinModal = () => {
    if (!deleteReason.trim()) {
      toast.error("Please provide a reason for account deletion.");
      return;
    }
    setIsDeleteModalOpen(false);
    setIsDeletePinModalOpen(true);
  };

  const handleExecuteAccountDeletion = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    setIsDeletePinModalOpen(false);
    setIsSubmittingDelete(true);
    toast.loading("Submitting account deletion request...", { id: "delete-req" });

    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/profile/delete-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          action: "request",
          reason: deleteReason,
          pin,
          isBiometricAuthenticated,
        }),
      });

      const data = await res.json();
      toast.dismiss("delete-req");

      if (res.ok && data.success) {
        toast.success("Dear customer your request have been subited action will be taking ASAP Thanks");
        setIsDeleteModalOpen(false);
        setDeleteReason("");
        if (updateUserData) {
          updateUserData({ deleteRequested: true });
        }
      } else {
        toast.error(data.error || "Failed to submit deletion request.");
      }
    } catch {
      toast.dismiss("delete-req");
      toast.error("Network error submitting request.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const handleCancelAccountDeletion = async () => {
    setIsSubmittingDelete(true);
    toast.loading("Canceling account deletion request...", { id: "cancel-delete" });

    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/profile/delete-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          action: "cancel",
        }),
      });

      const data = await res.json();
      toast.dismiss("cancel-delete");

      if (res.ok && data.success) {
        toast.success("Account deletion request canceled!");
        if (updateUserData) {
          updateUserData({ deleteRequested: false });
        }
      } else {
        toast.error(data.error || "Failed to cancel request.");
      }
    } catch {
      toast.dismiss("cancel-delete");
      toast.error("Network error canceling request.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  return (
    <>
      <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

      <main className="mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-28 min-[375px]:pb-32 text-black font-hanken">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto space-y-6"
        >
          {/* Section: Profile Header & Photo Editor */}
          <ProfileHeaderSection
            userName={userName}
            userEmail={userEmail}
            currentPhoto={currentPhoto}
            isProfileLoading={isProfileLoading}
            kycStatus={userData?.kycStatus as string | undefined}
            isFrozen={Boolean(userData?.isFrozen || userData?.status === "FROZEN")}
            onPhotoUploaded={async (photoURL) => {
              await updateUserData({ photoURL });
            }}
          />

          {/* Dedicated Section: Referral Program */}
          <ReferralSection
            onNavigateToReferrals={() => router.push("/referrals")}
          />

          {/* Dedicated Section: Identity Verification & KYC Flow */}
          <KycStatusSection
            kycStatus={userData?.kycStatus as string | undefined}
            bvn={userData?.bvn as string | undefined}
            nin={userData?.nin as string | undefined}
            kycRejectionReason={userData?.kycRejectionReason as string | undefined}
            loadingAccount={loadingAccount}
            isProfileLoading={isProfileLoading}
            staticAccount={staticAccount}
            onOpenKycDrawer={() => setIsKycDrawerOpen(true)}
          />

          {/* Section: Security Preferences & Toggles */}
          <SecuritySettingsSection
            isPinRequired={isPinRequired}
            isFaceIdEnabled={isFaceIdEnabled}
            is2faOtpEnabled={is2faOtpEnabled}
            isBiometricLoginEnabled={isBiometricLoginEnabled}
            isBiometricTransferEnabled={isBiometricTransferEnabled}
            onTogglePinRequired={handleTogglePinRequired}
            onToggleFaceId={handleToggleFaceId}
            onToggle2faOtp={handleToggle2faOtp}
            onToggleBiometricLogin={handleToggleBiometricLogin}
            onToggleBiometricTransfer={handleToggleBiometricTransfer}
          />

          {/* Section: Daily Transfer Limit */}
          <TransferLimitsSection
            dailyLimit={dailyLimit}
          />

          {/* Section: Change Access PIN Form */}
          <ChangePinSection />

          {/* Section: Change Password Form */}
          <ChangePasswordSection />

          {/* Section: User Phone Number Management */}
          <PhoneNumberSection />

          {/* Section: Destructive Actions (Logout & Delete Request) */}
          <section className="pt-2 space-y-3">
            <button
              onClick={() => { triggerHaptic(); setIsLogoutOpen(true); }}
              className="w-full py-4 bg-[#dc3545]/10 hover:bg-[#dc3545]/15 border border-[#dc3545]/20 text-[#dc3545] rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              Sign Out from Device
            </button>

            {userData?.deleteRequested ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-center">
                <div className="flex items-center justify-center gap-1.5 text-amber-800 font-extrabold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-base">warning</span>
                  <span>Account Deletion Requested</span>
                </div>
                <p className="text-[11px] text-amber-700 font-medium">
                  Your account deletion request is currently pending approval.
                </p>
                <button
                  type="button"
                  disabled={isSubmittingDelete}
                  onClick={handleCancelAccountDeletion}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel Deletion Request
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { triggerHaptic(); setIsDeleteModalOpen(true); }}
                className="w-full py-3.5 bg-gray-100 hover:bg-red-50 hover:border-red-200 text-gray-600 hover:text-red-600 border border-gray-200 rounded-2xl flex items-center justify-center gap-2 font-extrabold uppercase tracking-widest text-xs active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                Request Delete Account
              </button>
            )}
          </section>
        </motion.div>
      </main>

      <KycVerificationDrawer
        isOpen={isKycDrawerOpen}
        onClose={() => setIsKycDrawerOpen(false)}
        onSuccess={() => {
          setIsKycDrawerOpen(false);
          window.location.reload();
        }}
      />

      <LogoutDrawer
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={handleLogoutConfirm}
      />

      {/* Account Deletion PIN / Biometric Authorization Modal */}
      <InvestmentPinModal
        isOpen={isDeletePinModalOpen}
        onClose={() => setIsDeletePinModalOpen(false)}
        title="Authorize Account Deletion"
        description="Enter your 4-digit PIN to authorize account deletion request."
        isSubmitting={isSubmittingDelete}
        onPinSubmit={(pin, isBiometric) => handleExecuteAccountDeletion(pin, isBiometric)}
      />

      {/* Account Deletion Request Drawer Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl p-6 z-[100001] space-y-4 font-hanken shadow-2xl text-black"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />

              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2 text-red-600">
                  <span className="material-symbols-outlined text-2xl font-bold">delete_forever</span>
                  <h3 className="font-extrabold text-base text-black">Request Delete Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base font-bold">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                  Submitting an account deletion request will submit your account for inspection and closure.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                    Reason for deletion <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Please state why you want to delete your account (Required)..."
                    className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:border-red-500 transition-all resize-none"
                  />
                </div>

                <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2.5 text-red-800 text-[11px] font-semibold">
                  <span className="material-symbols-outlined text-lg shrink-0">info</span>
                  <span>You will be prompted to enter your 4-digit transaction PIN / 2FA OTP to authorize this request.</span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!deleteReason.trim() || isSubmittingDelete}
                  onClick={handleOpenDeletePinModal}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span>Authorize Request</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNav />
    </>
  );
}
