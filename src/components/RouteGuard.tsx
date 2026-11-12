"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { handleAppSignOut } from "@/lib/logout-util";
import { AppLogo } from "@/components/AppLogo";
import { useAppConfig } from "@/lib/ConfigContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useScrollRestoration } from "@/lib/useScrollRestoration";

// Persistently identify the device using sessionStorage instead of localStorage (Bypasses caching on Ctrl+F5)
const getOrCreateDeviceId = (): string => {
  if (typeof window === "undefined") return "";
  let devId = sessionStorage.getItem("deviceId");
  if (!devId) {
    devId = "device_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem("deviceId", devId);
  }
  return devId;
};

// Global flat micro spinner
const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isPinVerified, userData, updateUserData, deviceAuthState } = useAuth();
  const { config, isConfigLoaded } = useAppConfig();
  const router = useRouter();
  const pathname = usePathname();

  // Enable global scroll position persistence & back history scroll restoration
  useScrollRestoration();

  const [flwVerifying, setFlwVerifying] = useState(false);
  const [flwMessage, setFlwMessage] = useState("");

  // Multi-Device Suspension States (OPay-like Session Overlap Blockers)
  const [isSessionSuspended, setIsSessionSuspended] = useState(false);
  const [isNewDeviceBlocked, setIsNewDeviceBlocked] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinChangeError, setPinChangeError] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Capture the exact instant the multi-device conflict is intercepted
  const [suspendTime] = useState(() => new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }));

  // System-wide update states for real-time versions & Google Play Store update modal
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [playStoreProgress, setPlayStoreProgress] = useState(0);
  const [playStoreStatusText, setPlayStoreStatusText] = useState("Downloading update...");

  const initializingDeviceRef = useRef(false);

  // New device authorization form states
  const [verPhone, setVerPhone] = useState("");
  const [verBvnOrNinOrEmail, setVerBvnOrNinOrEmail] = useState("");
  const [verifyingDevice, setVerifyingDevice] = useState(false);
  const [verError, setVerError] = useState("");

  const handleVerifyNewDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;
    setVerifyingDevice(true);
    setVerError("");

    try {
      const deviceId = getOrCreateDeviceId();
      const inputPhone = verPhone.trim().replace(/\D/g, "");
      const storedPhone = String(userData.phoneNumber || userData.phone || "").trim().replace(/\D/g, "");

      // Match phone number (safely match last 10 digits or exact match)
      const phoneMatched = storedPhone && (storedPhone === inputPhone || storedPhone.endsWith(inputPhone) || inputPhone.endsWith(storedPhone));

      if (!phoneMatched) {
        setVerError("Incorrect phone number. Please enter the number registered with this account.");
        setVerifyingDevice(false);
        return;
      }

      const bvnValue = String(userData.bvn || "").trim();
      const ninValue = String(userData.nin || "").trim();
      const kycVal = bvnValue || ninValue;
      const hasKyc = !!kycVal;

      let credentialsMatched = false;

      if (hasKyc) {
        const last4 = kycVal.slice(-4);
        credentialsMatched = (verBvnOrNinOrEmail.trim() === last4);
        if (!credentialsMatched) {
          setVerError("Incorrect verification details. Please enter the last 4 digits of your BVN or NIN.");
          setVerifyingDevice(false);
          return;
        }
      } else {
        const storedEmail = String(userData.email || "").trim().toLowerCase();
        credentialsMatched = (verBvnOrNinOrEmail.trim().toLowerCase() === storedEmail);
        if (!credentialsMatched) {
          setVerError("Incorrect email address. Please enter your registered email address.");
          setVerifyingDevice(false);
          return;
        }
      }

      if (credentialsMatched) {
        const currentVerified = Array.isArray(userData.verifiedDevices) ? userData.verifiedDevices : [];
        const updatedDevices = Array.from(new Set([...currentVerified, deviceId]));

        await updateUserData({
          verifiedDevices: updatedDevices,
          currentDeviceId: deviceId
        });

        setIsNewDeviceBlocked(false);
        toast.success("Device verified and authorized successfully!");
      }
    } catch (err: any) {
      console.error("[Device Verification Failure]:", err);
      setVerError(err.message || "Device authorization failed. Please try again.");
    } finally {
      setVerifyingDevice(false);
    }
  };

  const handleSignOutFromBlockedDevice = async () => {
    try {
      await handleAppSignOut(router);
    } catch (err) {
      console.error("Sign out error from blocked device:", err);
      sessionStorage.clear();
      router.push("/auth/login");
    }
  };

  // Real-time server-side version mismatch update controller
  useEffect(() => {
    const isMock = typeof window !== "undefined" && (sessionStorage.getItem("mock") === "true" || window.location.search.includes("mock=true"));
    if (isMock || !isConfigLoaded) return;
    if (typeof window === "undefined" || !config?.appVersion) return;

    const serverVersion = (config.appVersion || "").trim();
    if (!serverVersion) return;

    const localVersion = (localStorage.getItem("app_version") || "").trim();
    const sessionVersion = (sessionStorage.getItem("cached_app_version") || "").trim();
    const currentCachedVersion = localVersion || sessionVersion;

    if (!currentCachedVersion) {
      // First time loading: register current server version silently without modal trigger
      localStorage.setItem("app_version", serverVersion);
      sessionStorage.setItem("cached_app_version", serverVersion);
      setShowVersionModal(false);
    } else if (currentCachedVersion !== serverVersion) {
      setShowVersionModal(true);
    } else {
      setShowVersionModal(false);
    }
  }, [config?.appVersion, isConfigLoaded]);

  const handlePerformAppUpdate = async () => {
    if (!config?.appVersion) return;
    setIsApplyingUpdate(true);
    setPlayStoreProgress(0);
    setPlayStoreStatusText("Downloading update...");

    const serverVersion = config.appVersion.trim();

    // Immediately record server version into storage & dismiss modal state to prevent repeat prompts
    localStorage.setItem("app_version", serverVersion);
    sessionStorage.setItem("cached_app_version", serverVersion);

    // Simulated Google Play Store downloading & installing progress
    const updateInterval = setInterval(() => {
      setPlayStoreProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 8) + 5;
        if (next >= 60 && next < 90) {
          setPlayStoreStatusText("Installing update...");
        } else if (next >= 90) {
          setPlayStoreStatusText("Completing installation...");
        }

        if (next >= 100) {
          clearInterval(updateInterval);
          executeAppPurgeAndReload(serverVersion);
          return 100;
        }
        return next;
      });
    }, 120);
  };

  const executeAppPurgeAndReload = async (latestVersion: string) => {
    try {
      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      sessionStorage.clear();

      // Write authoritative latest version into storage
      localStorage.setItem("app_version", latestVersion);
      sessionStorage.setItem("cached_app_version", latestVersion);

      setTimeout(() => {
        window.location.href = window.location.origin + pathname + "?v=" + Date.now();
      }, 200);
    } catch {
      window.location.reload();
    }
  };

  // Detect and verify Flutterwave redirects globally on app startup
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    const status = params.get("status");
    const transactionId = params.get("transaction_id") || params.get("transactionId");
    const txRef = params.get("tx_ref") || params.get("txRef");

    if (verify === "flw" || transactionId || status === "successful" || status === "completed" || status === "cancelled") {
      if (status === "cancelled") {
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

              const res = await fetch("/api/flutterwave/cancel", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({ txRef })
              });
              await res.json();
            } catch (err) {
              console.error("[Cancel Cleanup Error] Failed:", err);
            } finally {
              const url = new URL(window.location.href);
              url.search = "";
              window.history.replaceState({}, "", url.toString());
            }
          };

          handleCancelCleanup();
        } else {
          const url = new URL(window.location.href);
          url.search = "";
          window.history.replaceState({}, "", url.toString());
        }
        return;
      }

      if (!transactionId) return;

      const verifyTransaction = async () => {
        setFlwVerifying(true);
        setFlwMessage("Securing settlement credentials...");

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

          const res = await fetch("/api/flutterwave/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({ transactionId, txRef })
          });
          const data = await res.json();

          if (data.success) {
            const url = new URL(window.location.href);
            url.search = "";
            window.history.replaceState({}, "", url.toString());

            if (data.duplicate) {
              toast.info("Transaction already processed", {
                description: "This transaction has already been processed. Your wallet was not credited again."
              });
            } else {
              toast.success("Wallet funded successfully!", {
                description: data.message || "Your payment was verified and credited."
              });
            }
          } else {
            toast.error("Payment settlement was rejected.", {
              description: data.error || "Please contact customer support."
            });
            const url = new URL(window.location.href);
            url.search = "";
            window.history.replaceState({}, "", url.toString());
          }
        } catch (err) {
          console.error("[Verification Complete] Error:", err);
          toast.error("Verification failed.", {
            description: "Connection error with settlement gateway."
          });
        } finally {
          setFlwVerifying(false);
        }
      };

      verifyTransaction();
    }
  }, []);

  // Smooth scroll reset helper
  useEffect(() => {
    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        setTimeout(() => {
          window.scrollTo({ top: window.scrollY, left: 0, behavior: "smooth" });
        }, 50);
      }
    };

    document.addEventListener("focusout", handleBlur);
    return () => {
      document.removeEventListener("focusout", handleBlur);
    };
  }, []);

  // Single-device session listener & verification guard
  useEffect(() => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (loading || isMock || !user || !userData) return;

    // Skip device enforcement on public/auth routes
    const isPublicRoute = pathname === "/auth/login" || pathname === "/auth/signup" || pathname === "/cpanel" || pathname?.startsWith("/cpanel");
    if (isPublicRoute) return;

    const deviceId = getOrCreateDeviceId();
    const verifiedList = Array.isArray(userData.verifiedDevices) ? userData.verifiedDevices : [];

    // Check if New Device Detector is disabled globally via CPanel
    if (config?.newDeviceDetectorEnabled === false) {
      setIsNewDeviceBlocked(false);
      return;
    }

    // 1. First-time registration of deviceId: Whitelist the first device used to register/login
    if (!userData.registeredDeviceId && !initializingDeviceRef.current) {
      initializingDeviceRef.current = true;
      updateUserData({
        registeredDeviceId: deviceId,
        verifiedDevices: [deviceId],
        currentDeviceId: deviceId,
      })
        .then(() => {
          setIsNewDeviceBlocked(false);
          initializingDeviceRef.current = false;
        })
        .catch((err) => {
          console.error("Failed to initialize registered device:", err);
          initializingDeviceRef.current = false;
        });
      return;
    }

    // 2. Real-time active session validation (Suspend session if logged in elsewhere)
    const isCurrentDeviceVerified = userData.registeredDeviceId === deviceId || verifiedList.includes(deviceId);
    if (isCurrentDeviceVerified) {
      setIsNewDeviceBlocked(false);

      if (userData.currentDeviceId && userData.currentDeviceId !== deviceId) {
        console.warn("[Device Guard] Active session changed to another device. Quietly signing out old device...");
        handleAppSignOut(null);
        return;
      }

      // If we are verified but database records another currentDeviceId, sync it atomically
      if (userData.currentDeviceId !== deviceId && !initializingDeviceRef.current) {
        initializingDeviceRef.current = true;
        updateUserData({ currentDeviceId: deviceId })
          .then(() => {
            initializingDeviceRef.current = false;
          })
          .catch(() => {
            initializingDeviceRef.current = false;
          });
      }
    } else {
      // 3. Unrecognized device detected: Bypassed as per user instructions (never block)
      setIsNewDeviceBlocked(false);
    }
  }, [user, loading, userData, pathname, router, updateUserData, config?.newDeviceDetectorEnabled]);

  // Instant verification check: triggered when user focuses the tab or tab becomes visible again
  useEffect(() => {
    if (typeof window === "undefined" || !user || !userData) return;

    const performInstantSessionCheck = async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const freshData = userSnap.data();
          const verifiedList = Array.isArray(freshData.verifiedDevices) ? freshData.verifiedDevices : [];
          const isVerifiedOnThisDevice = freshData.registeredDeviceId === deviceId || verifiedList.includes(deviceId);

          if (isVerifiedOnThisDevice && freshData.currentDeviceId && freshData.currentDeviceId !== deviceId) {
            console.warn("[Instant Session Check] Session overtaken. Quietly signing out old device...");
            handleAppSignOut(null);
          }
        }
      } catch (err) {
        console.warn("[Instant Session Check Failed]:", err);
      }
    };

    const handleFocusCheck = () => {
      performInstantSessionCheck();
    };

    window.addEventListener("focus", handleFocusCheck);
    document.addEventListener("visibilitychange", handleFocusCheck);

    return () => {
      window.removeEventListener("focus", handleFocusCheck);
      document.removeEventListener("visibilitychange", handleFocusCheck);
    };
  }, [user, userData]);

  // Route protection rules for standard login status & pending device verification
  useEffect(() => {
    const isMock = typeof window !== "undefined" && (sessionStorage.getItem("mock") === "true" || window.location.search.includes("mock=true"));
    if ((loading || (user && !userData)) && !isMock) return;

    const isPublicRoute = pathname === "/auth/login" || pathname === "/auth/signup" || pathname === "/cpanel" || pathname?.startsWith("/cpanel");

    if (!user && !isMock) {
      if (!isPublicRoute) {
        router.push("/auth/login");
      }
    } else if (user && userData) {
      // If user is authenticated but session check is in progress OR device verification is pending, restrict access completely
      if (deviceAuthState === "CHECKING_DEVICE_SESSION" || deviceAuthState === "AUTHENTICATED_PENDING_DEVICE_VERIFICATION") {
        return; // Modal or splash handles view; do not allow navigating into wallet routes prematurely
      }

      const hasPin = Boolean(userData?.pin || userData?.pinHash);
      const isPinRequired = userData?.isPinRequired !== false;

      if (pathname === "/cpanel" || pathname?.startsWith("/cpanel")) {
        return;
      }

      const isNotificationDeepLink = typeof window !== "undefined" && (
        window.location.search.includes("txRef=") ||
        window.location.search.includes("transactionReference=") ||
        window.location.search.includes("reference=") ||
        Boolean(sessionStorage.getItem("pending_notification_tx_ref")) ||
        Boolean(sessionStorage.getItem("notification_receipt_active"))
      );

      if (!hasPin && pathname !== "/auth/pin-setup") {
        router.push("/auth/pin-setup");
      } else if (hasPin && isPinRequired && !isPinVerified && pathname !== "/auth/pin" && !isNotificationDeepLink) {
        router.push("/auth/pin");
      } else if (
        (hasPin && isPinVerified && (pathname === "/auth/login" || pathname === "/auth/signup" || pathname === "/auth/pin" || pathname === "/auth/pin-setup")) ||
        (hasPin && !isPinRequired && (pathname === "/auth/login" || pathname === "/auth/signup" || pathname === "/auth/pin" || pathname === "/auth/pin-setup"))
      ) {
        router.push("/");
      }
    }
  }, [user, loading, isPinVerified, userData, pathname, router, deviceAuthState]);


  // Re-login trigger inside the Suspend Overlay
  const handleSuspendReLogin = async () => {
    setIsLoggingOut(true);
    toast.loading("Clearing session state...");
    try {
      if ("caches" in window) {
        await caches.keys().then((keys) => {
          return Promise.all(keys.map((key) => caches.delete(key)));
        });
      }
      sessionStorage.clear();
      await handleAppSignOut(router);
    } catch {
      toast.dismiss();
      toast.error("Failed to re-login smoothly.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Inline PIN override for suspended accounts (Change Password)
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError("");

    if (newPin.length !== 4 || isNaN(Number(newPin))) {
      setPinChangeError("Security PIN must be a 4-digit numeric code.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinChangeError("The confirmed PIN does not match.");
      return;
    }

    setIsSavingPin(true);
    toast.loading("Securing new PIN credentials...");

    try {
      let idToken = "mock-token";
      const isMock = sessionStorage.getItem("mock") === "true";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      // Secure REST API POST to /api/auth/pin with action 'set' (Updates user pinHash server-side atomically)
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: "set",
          pin: newPin
        })
      });

      const data = await res.json();
      toast.dismiss();

      if (res.ok && data.success) {
        toast.success("Security PIN updated successfully!", {
          description: "Your credentials are changed. Logging out of conflict state..."
        });
        // Clear conflicting sessions and force logout to re-login with the new PIN
        setIsChangingPin(false);
        setNewPin("");
        setConfirmPin("");
        handleSuspendReLogin();
      } else {
        setPinChangeError(data.error || "Failed to save secure PIN in database.");
      }
    } catch {
      toast.dismiss();
      setPinChangeError("Network connection failure changing PIN.");
    } finally {
      setIsSavingPin(false);
    }
  };

  if (flwVerifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
        <div className="relative flex flex-col items-center">
          <div className="flex flex-col items-center p-6 rounded-3xl bg-[#fdfdfd]/80 backdrop-blur-md border border-gray-100/50 max-w-xs text-center">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.0, ease: "linear" }}
                className="absolute inset-0 rounded-full border-[3px] border-gray-100/80 border-t-[#FC7A00] border-r-[#0b513d]"
              />
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px] font-bold animate-pulse">lock_clock</span>
            </div>

            <h3 className="font-hanken font-extrabold text-xs text-gray-900 uppercase tracking-wider mt-4">Verifying Settlement</h3>
            <p className="font-hanken text-[10px] text-gray-500 mt-1.5 font-semibold leading-relaxed">
              {flwMessage || "Connecting to Flutterwave rails to verify your secure transaction deposit..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isMockRoute = typeof window !== "undefined" && (sessionStorage.getItem("mock") === "true" || window.location.search.includes("mock=true"));
  if (loading && !isMockRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent p-6">
        <div className="relative flex flex-col items-center">
          <div className="flex flex-col items-center p-5 rounded-2xl bg-[#fdfdfd]/80 backdrop-blur-md border border-gray-100/50">
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
              className="mt-3 font-hanken font-bold text-[8px] tracking-[0.25em] uppercase text-gray-400 select-none"
            >
              E-Global Pay
            </motion.p>
          </div>
        </div>
      </div>
    );
  }

  // Render Full-Screen Drawer Modal when a new version update is detected
  if (showVersionModal) {
    return (
      <div className="fixed inset-0 z-[9999999] bg-[#ffffff] text-gray-900 flex flex-col justify-between p-6 md:p-10 overflow-hidden select-none font-hanken">
        {/* Top Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AppLogo size={32} />
            <span className="font-black text-sm tracking-wider uppercase text-gray-900">E-GLOBAL PAY</span>
          </div>
          <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-[#FC7A00] rounded-full text-[10px] font-black uppercase tracking-wider">
            v{config?.appVersion || "1.0.1"}
          </span>
        </div>

        {/* Center Content Drawer */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-md mx-auto my-auto w-full text-center space-y-6"
        >
          {/* Main Display: Google Play Store style loader vs App Update Emblem */}
          {!isApplyingUpdate ? (
            <div className="relative w-24 h-20 mx-auto flex items-center justify-center">
              <div className="w-20 h-20 rounded-3xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FC7A00] shadow-xs">
                <span className="material-symbols-outlined text-[42px]" style={{ fontVariationSettings: '"FILL" 1' }}>system_update</span>
              </div>
            </div>
          ) : (
            <div className="relative w-28 h-28 mx-auto flex flex-col items-center justify-center">
              {/* Google Play Store Ring Spinner */}
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Track Circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="#f3f4f6"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  {/* Progress Circle (Google Play Store Green / Brand Accent) */}
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="#01875f"
                    strokeWidth="8"
                    strokeDasharray={264}
                    strokeDashoffset={264 - (264 * playStoreProgress) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                    transition={{ ease: "easeInOut" }}
                  />
                </svg>

                {/* Center Percentage Count */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-xl font-black text-[#01875f]">{playStoreProgress}%</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h1 className="font-hanken font-black text-2xl text-gray-900 uppercase tracking-tight leading-tight">
              {isApplyingUpdate ? playStoreStatusText : "New Update"}
            </h1>
            <p className="text-xs text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">
              {isApplyingUpdate
                ? "Please wait while the update is being downloaded and installed..."
                : "A new update is ready for your app. Update now to enjoy new features, enhanced security, and performance improvements."}
            </p>
          </div>

          {!isApplyingUpdate && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-left space-y-2.5 shadow-xs">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">What&apos;s Included in this update</p>
              <div className="space-y-2 text-xs font-bold text-gray-700">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#01875f]">check_circle</span>
                  <span>Enhanced security and stability improvements</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#01875f]">check_circle</span>
                  <span>Faster transaction processing speeds</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#01875f]">check_circle</span>
                  <span>New features and user interface refinements</span>
                </div>
              </div>
            </div>
          )}

          {isApplyingUpdate && (
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#01875f] rounded-full"
                style={{ width: `${playStoreProgress}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          )}
        </motion.div>

        {/* Bottom Action Footer */}
        <div className="max-w-md mx-auto w-full pt-4">
          <button
            type="button"
            disabled={isApplyingUpdate}
            onClick={handlePerformAppUpdate}
            className="w-full py-4 bg-[#01875f] hover:bg-[#016f4e] active:scale-98 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-75"
          >
            {isApplyingUpdate ? (
              <>
                <ButtonSpinner />
                <span>{playStoreStatusText} ({playStoreProgress}%)</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>UPDATE NOW</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // OPay-like Multi-Device Real-time suspension Modal overlay screen (Extremely high-fidelity)
  if (isSessionSuspended && userData) {
    const activeDeviceModel = (userData.currentDeviceModel || userData.platform || "Unrecognized Mobile Device") as string;
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[32px] p-6 text-center space-y-6 border border-gray-200"
        >
          {/* Warning Icon and Title header */}
          <div className="space-y-2">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <span className="material-symbols-outlined text-[34px] animate-pulse" style={{ fontVariationSettings: '"FILL" 1' }}>gpp_bad</span>
            </div>
            <h2 className="font-hanken font-black text-lg text-black uppercase tracking-wider leading-tight">
              SESSION EXPIRED
            </h2>
            <p className="font-hanken text-[10px] text-rose-600 font-black uppercase tracking-widest leading-none">
              Logged in on another device
            </p>
          </div>

          {/* Device logs details box */}
          <div className="p-4 bg-gray-50 border border-gray-150 rounded-2xl text-left space-y-2.5">
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Conflict Session Details</p>
            <div className="grid grid-cols-1 gap-2 text-xs font-semibold text-gray-800">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">smartphone</span>
                <span className="text-gray-500 uppercase">Device:</span>
                <span className="font-bold select-all text-gray-900">{activeDeviceModel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">calendar_month</span>
                <span className="text-gray-500 uppercase">Timestamp:</span>
                <span className="font-mono text-gray-900 font-bold">{suspendTime}</span>
              </div>
            </div>
          </div>

          {/* Conflict safety notice */}
          <p className="font-hanken text-[11px] text-gray-500 leading-relaxed font-semibold">
            Your account was logged in on another device. For your financial safety, this session has been suspended.
            <span className="text-rose-600 block mt-1.5 font-bold uppercase text-[9px] tracking-wider">
              If you did not do this, kindly change your access credentials immediately.
            </span>
          </p>

          {/* Action Row */}
          {!isChangingPin ? (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleSuspendReLogin}
                className="w-full py-3.5 bg-black hover:bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoggingOut ? <><ButtonSpinner /> Clearing Session...</> : "Dismiss & Re-login"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPinChangeError("");
                  setIsChangingPin(true);
                }}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
              >
                Change Security PIN
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePinSubmit} className="space-y-4 text-left border-t border-gray-100 pt-4 animate-fadeIn">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Enter New 4-Digit PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="New 4-digit code"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono font-bold text-center"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Confirm New 4-Digit PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="Confirm 4-digit code"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>

              {pinChangeError && (
                <p className="text-[10px] text-red-600 font-bold text-center">{pinChangeError}</p>
              )}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsChangingPin(false)}
                  className="w-1/3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-black uppercase text-center"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSavingPin || newPin.length !== 4}
                  className="w-2/3 py-3 bg-[#FC7A00] text-white rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50"
                >
                  {isSavingPin ? <><ButtonSpinner /> Saving...</> : "Save PIN & Log Out"}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  const isPublicRoute = pathname === "/auth/login" || pathname === "/auth/signup" || pathname === "/cpanel" || pathname?.startsWith("/cpanel");

  if (!user && !isPublicRoute && !isMockRoute) return null;
  if (pathname === "/cpanel" || pathname?.startsWith("/cpanel")) return <>{children}</>;

  // RENDER-LEVEL SECURITY GATE 1: Pending New-Device Verification HARD BLOCK
  // Prevents zero wallet children from mounting/rendering underneath, independent of PIN state or isPinRequired setting.
  if (user && deviceAuthState === "AUTHENTICATED_PENDING_DEVICE_VERIFICATION" && !isPublicRoute && !isMockRoute) {
    return (
      <div className="fixed inset-0 z-[99999] bg-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex flex-col items-center max-w-sm p-6 rounded-3xl bg-[#fdfdfd] border border-gray-100 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-[32px] animate-pulse" style={{ fontVariationSettings: '"FILL" 1' }}>security</span>
          </div>
          <div className="space-y-1">
            <h2 className="font-hanken font-extrabold text-base text-gray-900 uppercase tracking-wider">
              NEW DEVICE DETECTED
            </h2>
            <p className="font-hanken text-xs text-amber-600 font-bold uppercase tracking-widest">
              Security Verification Required
            </p>
          </div>
          <p className="font-hanken text-xs text-gray-500 font-medium leading-relaxed">
            For your security, wallet routes and protected financial services are locked on this unrecognized device until you verify the security code.
          </p>
        </div>
      </div>
    );
  }

  // Wait for Firestore user data & session state check before making any PIN decision
  if (user && (deviceAuthState === "CHECKING_DEVICE_SESSION" || !userData) && !isMockRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent p-6">
        <div className="relative flex flex-col items-center">
          <div className="flex flex-col items-center p-5 rounded-2xl bg-[#fdfdfd]/80 backdrop-blur-md border border-gray-100/50">
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
              className="mt-3 font-hanken font-bold text-[8px] tracking-[0.25em] uppercase text-gray-400 select-none"
            >
              E-Global Pay
            </motion.p>
          </div>
        </div>
      </div>
    );
  }

  if (user && !(userData?.pin || userData?.pinHash) && pathname !== "/auth/pin-setup") return null;
  const isPinRequired = userData?.isPinRequired !== false;
  const isNotificationDeepLink = typeof window !== "undefined" && (
    window.location.search.includes("txRef=") ||
    window.location.search.includes("transactionReference=") ||
    window.location.search.includes("reference=") ||
    Boolean(sessionStorage.getItem("pending_notification_tx_ref")) ||
    Boolean(sessionStorage.getItem("notification_receipt_active"))
  );
  if (user && (userData?.pin || userData?.pinHash) && isPinRequired && !isPinVerified && pathname !== "/auth/pin" && !isNotificationDeepLink) return null;

  return <>{children}</>;
}
