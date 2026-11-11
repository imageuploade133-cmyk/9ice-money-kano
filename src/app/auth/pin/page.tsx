"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

import { LogoutDrawer } from "@/components/layout/LogoutDrawer";
import { handleAppSignOut } from "@/lib/logout-util";
import { AppLogo } from "@/components/AppLogo";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { getBiometricLabel, getBiometricType, authenticateBiometricDetailed } from "@/lib/biometrics-util";

function maskEmail(email?: string | null): string {
  if (!email || !email.includes("@")) return "t***t@gmail.com";
  const parts = email.trim().split("@");
  const local = parts[0];
  const domain = parts.slice(1).join("@");
  if (local.length <= 1) {
    return `${local}***@${domain}`;
  }
  if (local.length === 2) {
    return `${local[0]}*${local[1]}@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskPhone(phone?: string | null): string {
  if (!phone) return "23480***34";
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.length <= 5) {
    return `${cleaned.slice(0, 2)}***${cleaned.slice(-1)}`;
  }
  const prefix = cleaned.slice(0, 5);
  const suffix = cleaned.slice(-2);
  return `${prefix}***${suffix}`;
}

export default function PinPage() {
  const [pin, setPin] = useState("");
  const [keypadNumbers, setKeypadNumbers] = useState<string[]>([]);
  const { user, userData, setPinVerified, loading } = useAuth();
  const router = useRouter();

  // Logout confirmation state
  const [isLogoutDrawerOpen, setIsLogoutDrawerOpen] = useState(false);

  const biometricLabel = getBiometricLabel();
  const biometricType = getBiometricType();

  // Face ID / Biometrics Modal State
  const [showFaceIdModal, setShowFaceIdModal] = useState(false);

  useModalBackHandler(showFaceIdModal, () => setShowFaceIdModal(false), "face-id-drawer");

  // Biometric login execution - triggered explicitly on user button click or automatically on launch
  const handleBiometricAuth = async () => {
    // Verify if biometric login has been enabled by user
    const isBiometricEnabled = userData?.isBiometricLoginEnabled === true || userData?.isFaceIdEnabled === true;
    if (!isBiometricEnabled) {
      toast.error("Kindly enable Biometric Login in Security Settings to have access.");
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Internet connection required to verify biometrics and log in.");
      return;
    }

    toast.loading(`Authenticating ${biometricLabel}...`);
    const res = await authenticateBiometricDetailed(`Login with ${biometricLabel}`);
    toast.dismiss();

    if (res.success) {
      if (userData?.is2faOtpEnabled === true) {
        setIs2faStage(true);
        return;
      }
      setPinVerified(true);
      toast.success(`${biometricLabel} Authenticated! Welcome back.`);
      router.push("/");
    } else if (res.cancelled) {
      setPin("");
    } else {
      toast.error(res.message || `${biometricLabel} authentication failed.`);
      setPin("");
    }
  };

  // Loading Delay State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyingText, setVerifyingText] = useState("Securing connection...");

  // Forgot PIN bottom drawer state & fast deferred content loading
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [isForgotContentReady, setIsForgotContentReady] = useState(false);

  useModalBackHandler(showForgotPin, () => setShowForgotPin(false), "forgot-pin-drawer");

  useEffect(() => {
    if (showForgotPin) {
      const raf = requestAnimationFrame(() => {
        setIsForgotContentReady(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsForgotContentReady(false);
    }
  }, [showForgotPin]);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetOption, setResetOption] = useState<"email" | "otp">("email");
  const hasPushedState = useRef(false);

  // PIN reset via WhatsApp flow states
  const [resetStage, setResetStage] = useState(1);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpCode, setOtpCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSavingNewPin, setIsSavingNewPin] = useState(false);

  // 2FA Login OTP Stage States on Access PIN screen
  const [is2faStage, setIs2faStage] = useState(false);

  // Biometric login remains available through its explicit button.
  // Do not launch the biometric unlock UI automatically when the app opens;
  // users should see the normal PIN screen first.
  const [has2faOtpBeenSent, setHas2faOtpBeenSent] = useState(false);
  const [login2faChannel, setLogin2faChannel] = useState<"email" | "whatsapp">("email");
  const [login2faOtpDigits, setLogin2faOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [login2faCooldown, setLogin2faCooldown] = useState(0);
  const [isSending2faOtp, setIsSending2faOtp] = useState(false);
  const [isVerifying2faOtp, setIsVerifying2faOtp] = useState(false);
  const [masked2faEmail, setMasked2faEmail] = useState("");
  const [masked2faPhone, setMasked2faPhone] = useState("");
  const login2faInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 2FA Cooldown countdown timer
  useEffect(() => {
    if (login2faCooldown <= 0) return;
    const timer = setInterval(() => {
      setLogin2faCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [login2faCooldown]);

  const handleLogin2faOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const updated = [...login2faOtpDigits];
    updated[index] = digit;
    setLogin2faOtpDigits(updated);

    if (digit && index < 5) {
      login2faInputRefs.current[index + 1]?.focus();
    }

    if (updated.join("").length === 6) {
      executeVerify2faOtp(updated.join(""));
    }
  };

  const handleLogin2faOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !login2faOtpDigits[index] && index > 0) {
      login2faInputRefs.current[index - 1]?.focus();
    }
  };

  const handleLogin2faOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;
    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasteData.length; i++) {
      updated[i] = pasteData[i];
    }
    setLogin2faOtpDigits(updated);
    const targetIdx = Math.min(pasteData.length, 5);
    login2faInputRefs.current[targetIdx]?.focus();

    if (updated.join("").length === 6) {
      executeVerify2faOtp(updated.join(""));
    }
  };

  const dispatch2faOtp = async (selectedChannel: "email" | "whatsapp" = login2faChannel) => {
    if (!user) return;
    setIsSending2faOtp(true);
    toast.loading(`Sending 2FA OTP code via ${selectedChannel === "email" ? "Email" : "WhatsApp"}...`);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/login-2fa-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "send", channel: selectedChannel }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "2FA OTP code sent!");
        if (data.maskedEmail) setMasked2faEmail(data.maskedEmail);
        if (data.maskedPhone) setMasked2faPhone(data.maskedPhone);
        if (data.devOtp) toast.info(`Dev Mode OTP: ${data.devOtp}`);
        setHas2faOtpBeenSent(true);
        setLogin2faCooldown(60);
      } else {
        toast.error(data.error || "Failed to send 2FA OTP code.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error sending 2FA OTP code.");
    } finally {
      setIsSending2faOtp(false);
    }
  };

  const executeVerify2faOtp = async (code: string) => {
    if (!user || code.length !== 6) return;
    setIsVerifying2faOtp(true);
    toast.loading("Verifying 2FA OTP code...");

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/login-2fa-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", otp: code }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        setPinVerified(true);
        toast.success("2FA Login Authenticated! Welcome back. 🛡️");
        router.push("/");
      } else {
        toast.error(data.error || "Invalid 2FA OTP code.");
        setLogin2faOtpDigits(["", "", "", "", "", ""]);
      }
    } catch {
      toast.dismiss();
      toast.error("Network error verifying 2FA OTP code.");
    } finally {
      setIsVerifying2faOtp(false);
    }
  };

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Masked contact info for UI display
  const rawEmail = (userData?.email || user?.email || "") as string;
  const rawPhone = (userData?.phoneNumber || userData?.phone || "") as string;
  const displayEmail = maskEmail(rawEmail);
  const displayPhone = maskPhone(rawPhone);

  // Cooldown countdown timer for OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Auto-focus first input box when entering Stage 2
  useEffect(() => {
    if (resetStage === 2) {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [resetStage]);

  // Reset stages when drawer is closed or opened
  useEffect(() => {
    if (!showForgotPin) {
      setResetStage(1);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpCode("");
      setNewPin("");
      setConfirmNewPin("");
      setOtpCooldown(0);
    }
  }, [showForgotPin]);

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    const combined = newDigits.join("");
    setOtpCode(combined);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...otpDigits];
        newDigits[index - 1] = "";
        setOtpDigits(newDigits);
        setOtpCode(newDigits.join(""));
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;
    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasteData.length; i++) {
      newDigits[i] = pasteData[i];
    }
    setOtpDigits(newDigits);
    setOtpCode(newDigits.join(""));
    const targetIndex = Math.min(pasteData.length, 5);
    inputRefs.current[targetIndex]?.focus();
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP code.");
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const idToken = await user?.getIdToken();
      const channel = resetOption === "email" ? "email" : "whatsapp";
      const activeSessionId = typeof window !== "undefined" ? localStorage.getItem("active_session_id") : null;
      const res = await fetch("/api/auth/pin-verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {})
        },
        body: JSON.stringify({ otpCode: code, channel })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let errStr = typeof data?.error === "string" ? data.error : "Failed to verify OTP code.";
        if (errStr.includes("<!DOCTYPE") || errStr.includes("Cannot POST") || errStr.includes("html")) {
          errStr = "WhatsApp OTP verification service is currently unavailable.";
        }
        toast.error(errStr);
      } else {
        toast.success(data.message || (resetOption === "email" ? "Email verified successfully!" : "WhatsApp number verified successfully!"));
        setResetStage(3); // Go to Set New PIN stage
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to verify OTP code.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSaveNewPin = async () => {
    if (newPin.length !== 4 || isNaN(Number(newPin))) {
      toast.error("PIN must be a valid 4-digit numeric code.");
      return;
    }
    if (newPin !== confirmNewPin) {
      toast.error("PINs do not match.");
      return;
    }
    setIsSavingNewPin(true);
    try {
      const idToken = await user?.getIdToken();
      const activeSessionId = typeof window !== "undefined" ? localStorage.getItem("active_session_id") : null;
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {})
        },
        body: JSON.stringify({
          action: "reset",
          pin: newPin
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to reset PIN on server.");
      } else {
        toast.success("Access PIN updated securely! Reloading to apply changes...");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update Access PIN.");
    } finally {
      setIsSavingNewPin(false);
    }
  };

  const shuffleKeypad = () => {
    const numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    setKeypadNumbers(numbers);
  };

  useEffect(() => {
    shuffleKeypad();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  // Sync state with browser back history for Forgot PIN drawer
  useEffect(() => {
    if (showForgotPin) {
      window.history.pushState({ forgotPinOpen: true }, "");
      hasPushedState.current = true;

      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault();
        hasPushedState.current = false;
        setShowForgotPin(false);
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
  }, [showForgotPin]);

  // Prevent background scroll when Forgot PIN drawer is active
  useEffect(() => {
    if (showForgotPin) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showForgotPin]);

  const handleLogOutFromPin = async () => {
    setIsLogoutDrawerOpen(false);
    await handleAppSignOut(router);
  };

  const handleRequestResetLink = async () => {
    setIsRequestingReset(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      if (isMock) {
        toast.success(resetOption === "email" ? "A 6-digit OTP has been sent to your registered email address." : "Verification code sent to registered WhatsApp number!");
        setResetStage(2);
        setOtpCooldown(60);
        return;
      }

      const idToken = await user?.getIdToken();
      const channel = resetOption === "email" ? "email" : "whatsapp";
      const activeSessionId = typeof window !== "undefined" ? localStorage.getItem("active_session_id") : null;
      const res = await fetch("/api/auth/pin-reset-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(activeSessionId ? { "X-Session-ID": activeSessionId } : {})
        },
        body: JSON.stringify({ channel })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let errStr = typeof data?.error === "string" ? data.error : `Failed to send ${resetOption === "email" ? "Email" : "WhatsApp"} OTP.`;
        if (
          errStr.includes("<!DOCTYPE") ||
          errStr.includes("Cannot POST") ||
          errStr.includes("html") ||
          errStr.includes("WhatsApp instance") ||
          errStr.includes("not active or connected") ||
          errStr.includes("WhatsApp Dispatch Failed")
        ) {
          errStr = "WhatsApp OTP service is currently unavailable. Please use the Email OTP option instead.";
        }
        toast.error(errStr);
      } else {
        toast.success(data.message || (resetOption === "email" ? "A 6-digit OTP has been sent to your registered email address." : "Verification code sent to registered WhatsApp number!"));
        setResetStage(2); // Transition to Stage 2: OTP Entry
        setOtpCooldown(60);
        if (data.devOtpCode) {
          toast.info(`Local Test Mode: OTP is ${data.devOtpCode}`);
        }
      }
    } catch (err) {
      console.error("PIN reset send-otp error:", err);
      toast.error("Failed to connect to verification server.");
    } finally {
      setIsRequestingReset(false);
    }
  };

  const handleForgotPinDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      setShowForgotPin(false);
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const newPinVal = pin + num;
      setPin(newPinVal);
      // Reshuffle after key press for maximum security
      shuffleKeypad();

      if (newPinVal.length === 4) {
        verifyPin(newPinVal);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    shuffleKeypad();
  };

  const verifyPin = async (submittedPin: string) => {
    setIsVerifying(true);
    setVerifyingText("Decrypting security key...");

    // Stage 1 of loading animation
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(800);
    setVerifyingText("Authenticating signature...");

    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      if (isMock) {
        await delay(1000);
        if (userData?.pin === submittedPin) {
          setPinVerified(true);
          toast.success("Identity verified");
          router.push("/");
        } else {
          toast.error("Incorrect PIN");
          setPin("");
          setIsVerifying(false);
        }
        return;
      }

      // Production server-side verify call
      if (!user) {
        toast.error("Authentication required.");
        setIsVerifying(false);
        return;
      }

      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: "verify",
          pin: submittedPin
        })
      });

      const data = await res.json();
      await delay(500);

      if (res.ok && data.success) {
        if (userData?.is2faOtpEnabled === true) {
          setIsVerifying(false);
          setIs2faStage(true);
          return;
        }

        setPinVerified(true);
        toast.success("Identity verified");
        router.push("/");
      } else {
        toast.error(data.message || data.error || "Incorrect PIN");
        setPin("");
        setIsVerifying(false);
      }
    } catch (err) {
      console.error("PIN verification error:", err);
      toast.error("Server authentication failed. Please try again.");
      setPin("");
      setIsVerifying(false);
    }
  };

  if (loading) return null;

  if (is2faStage) {
    return (
      <div className="flex flex-col min-h-screen bg-white p-6 md:p-8 items-center justify-between relative overflow-hidden font-hanken text-black">
        {/* Top Brand Logo */}
        <div className="w-full flex flex-col items-center text-center mt-6">
          <div className="relative w-14 h-14 mb-3 flex items-center justify-center">
            <AppLogo size={56} />
          </div>
          <h1 className="font-hanken font-bold text-xl tracking-tight text-black mb-1">E-Global Pay</h1>
          <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-[#FC7A00] font-black uppercase text-[10px] tracking-widest rounded-full shadow-2xs">
            2FA Security Active
          </span>
        </div>

        {/* Center 2FA OTP Card */}
        <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center space-y-5 my-6">
          <div className="w-16 h-16 rounded-full bg-orange-50 border-2 border-orange-100 flex items-center justify-center text-[#FC7A00] shadow-sm animate-bounce-subtle">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>shield_lock</span>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-bodoni font-bold text-2xl text-black tracking-tight">2FA OTP Verification</h2>
            <p className="font-hanken text-xs text-gray-500 font-semibold leading-relaxed max-w-xs mx-auto">
              Access PIN verified! Please enter the 6-digit OTP code sent to{" "}
              <span className="font-mono font-bold text-black">{login2faChannel === "email" ? (masked2faEmail || displayEmail) : (masked2faPhone || displayPhone)}</span>.
            </p>
          </div>

          {/* Channel Selector Pills */}
          <div className="space-y-2 w-full">
            <p className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wider text-left">Select Delivery Channel</p>
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl w-full border border-gray-200">
              <button
                type="button"
                disabled={isSending2faOtp || login2faCooldown > 0}
                onClick={() => {
                  if (login2faCooldown > 0) return;
                  setLogin2faChannel("email");
                }}
                className={cn(
                  "py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                  login2faChannel === "email" ? "bg-[#FC7A00] text-white shadow-xs" : "bg-transparent text-gray-500 hover:text-black",
                  login2faCooldown > 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                <span>Email</span>
              </button>

              <button
                type="button"
                disabled={isSending2faOtp || login2faCooldown > 0}
                onClick={() => {
                  if (login2faCooldown > 0) return;
                  setLogin2faChannel("whatsapp");
                }}
                className={cn(
                  "py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                  login2faChannel === "whatsapp" ? "bg-emerald-600 text-white shadow-xs" : "bg-transparent text-gray-500 hover:text-black",
                  login2faCooldown > 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <span className="material-symbols-outlined text-[16px]">chat</span>
                <span>WhatsApp</span>
              </button>
            </div>
            {login2faCooldown > 0 && (
              <p className="text-[10px] text-amber-600 font-bold tracking-wide">Channel locked during active 60s cooldown</p>
            )}
          </div>

          {/* Send OTP / Resend Timer Button */}
          <div className="pt-1 w-full">
            {!has2faOtpBeenSent ? (
              <button
                type="button"
                disabled={isSending2faOtp}
                onClick={() => dispatch2faOtp(login2faChannel)}
                className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50 transition-all shadow-xs"
              >
                {isSending2faOtp ? "Sending 2FA OTP Code..." : `Send OTP Code via ${login2faChannel === "email" ? "Email" : "WhatsApp"}`}
              </button>
            ) : (
              <div className="space-y-4 w-full pt-2">
                <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">Enter 6-Digit Security OTP</p>
                <div className="flex gap-2 justify-center w-full">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <input
                      key={idx}
                      ref={(el) => { login2faInputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={login2faOtpDigits[idx]}
                      disabled={isVerifying2faOtp || isSending2faOtp}
                      onChange={(e) => handleLogin2faOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleLogin2faOtpKeyDown(idx, e)}
                      onPaste={handleLogin2faOtpPaste}
                      className={cn(
                        "w-11 h-13 bg-white border-2 rounded-xl text-center font-mono font-black text-xl text-black transition-all outline-none shadow-xs",
                        login2faOtpDigits[idx]
                          ? "border-[#FC7A00] bg-orange-50/20 ring-2 ring-[#FC7A00]/20"
                          : "border-gray-200 focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20"
                      )}
                    />
                  ))}
                </div>

                {login2faCooldown > 0 ? (
                  <p className="text-xs text-gray-400 font-bold">Resend code in {login2faCooldown}s</p>
                ) : (
                  <button
                    type="button"
                    disabled={isSending2faOtp}
                    onClick={() => dispatch2faOtp(login2faChannel)}
                    className="text-xs font-bold text-[#FC7A00] hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5 justify-center mx-auto uppercase tracking-wider"
                  >
                    {isSending2faOtp ? "Dispatching New Code..." : "Resend OTP Code"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Verify & Cancel Actions */}
        <div className="w-full max-w-sm mx-auto flex flex-col gap-2.5 pb-6">
          {has2faOtpBeenSent && (
            <button
              type="button"
              disabled={isVerifying2faOtp || login2faOtpDigits.join("").length !== 6}
              onClick={() => executeVerify2faOtp(login2faOtpDigits.join(""))}
              className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer hover:brightness-105 active:scale-95 transition-all shadow-sm disabled:opacity-50"
            >
              {isVerifying2faOtp ? "Verifying 2FA Code..." : "Authenticate & Continue"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIs2faStage(false);
              setPin("");
              setLogin2faOtpDigits(["", "", "", "", "", ""]);
            }}
            className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
          >
            ← Return to Access PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white p-8 items-center justify-between relative overflow-hidden">
      {/* Full Screen High-Fidelity Loading Overlay */}
      <AnimatePresence>
        {isVerifying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/95 backdrop-blur-md z-[99999] flex flex-col items-center justify-center p-6"
          >
            <div className="relative flex flex-col items-center">
              {/* Spinning luxury gradient ring */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-3 border-gray-100 border-t-[#FC7A00] border-r-[#0b513d]"
                />

                {/* Logo container inside the ring with micro-scale pulse */}
                <motion.div
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                  className="relative w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm"
                >
                  <AppLogo size={28} />
                </motion.div>
              </div>

              {/* Status Message Text */}
              <motion.p
                key={verifyingText}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="mt-6 font-hanken font-bold text-xs tracking-wider uppercase text-gray-800 text-center"
              >
                {verifyingText}
              </motion.p>

              <p className="mt-2 font-hanken text-[11px] text-gray-400">
                Please do not close or exit the app
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full flex flex-col items-center text-center mt-6 min-[375px]:mt-10">
        <div className="relative w-14 h-14 min-[375px]:w-16 min-[375px]:h-16 mb-3 flex items-center justify-center">
          <AppLogo size={56} />
        </div>
        <h1 className="font-hanken font-bold text-lg min-[375px]:text-xl tracking-tight text-black mb-1">E-Global Pay</h1>
        <p className="text-gray-500 font-hanken tracking-widest uppercase text-[10px] min-[375px]:text-xs">Enter Access PIN</p>
      </div>

      <div className="flex gap-3 min-[375px]:gap-4 justify-center my-6 min-[375px]:my-10">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 min-[375px]:w-4 min-[375px]:h-4 rounded-full border-2 transition-all duration-300 ${
              pin.length > i ? "bg-black border-black scale-110" : "bg-transparent border-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="w-full max-w-[260px] min-[360px]:max-w-[290px] min-[410px]:max-w-xs grid grid-cols-3 gap-3 min-[360px]:gap-4 min-[410px]:gap-6 mb-6 min-[360px]:mb-10">
        {keypadNumbers.slice(0, 9).map((num) => (
          <motion.button
            whileTap={{ scale: 0.9, backgroundColor: "#000000", borderColor: "#000000", color: "#FFFFFF" }}
            whileHover={{ scale: 1.05 }}
            key={num}
            onClick={() => handleKeyPress(num)}
            className="w-16 h-16 min-[360px]:w-18 min-[360px]:h-18 min-[410px]:w-20 min-[410px]:h-20 rounded-full flex items-center justify-center text-xl min-[360px]:text-2xl font-hanken border border-gray-200 text-black cursor-pointer transition-colors"
          >
            {num}
          </motion.button>
        ))}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={handleBiometricAuth}
          className="w-16 h-16 min-[360px]:w-18 min-[360px]:h-18 min-[410px]:w-20 min-[410px]:h-20 rounded-full flex items-center justify-center text-[#FC7A00] border border-gray-200 bg-orange-50/50 cursor-pointer transition-colors"
          title={biometricLabel}
        >
          <span className="material-symbols-outlined text-[26px] min-[360px]:text-[30px] min-[410px]:text-3xl">
            {biometricType === "faceid" ? "face_6" : "fingerprint"}
          </span>
        </motion.button>
        {keypadNumbers[9] !== undefined && (
          <motion.button
            whileTap={{ scale: 0.9, backgroundColor: "#000000", borderColor: "#000000", color: "#FFFFFF" }}
            whileHover={{ scale: 1.05 }}
            onClick={() => handleKeyPress(keypadNumbers[9])}
            className="w-16 h-16 min-[360px]:w-18 min-[360px]:h-18 min-[410px]:w-20 min-[410px]:h-20 rounded-full flex items-center justify-center text-xl min-[360px]:text-2xl font-hanken border border-gray-200 text-black cursor-pointer transition-colors"
          >
            {keypadNumbers[9]}
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={handleDelete}
          className="w-16 h-16 min-[360px]:w-18 min-[360px]:h-18 min-[410px]:w-20 min-[410px]:h-20 rounded-full flex items-center justify-center text-black active:text-red-500 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px] min-[360px]:text-[28px] min-[410px]:text-3xl">backspace</span>
        </motion.button>
      </div>

      {/* Forgot PIN and Sign Out options below secure keypad */}
      <div className="flex justify-between w-full max-w-xs px-2 mb-8 font-hanken text-sm">
        <button
          onClick={() => setShowForgotPin(true)}
          className="text-gray-400 hover:text-black font-semibold transition-colors cursor-pointer"
        >
          Forgot PIN?
        </button>
        <button
          onClick={() => setIsLogoutDrawerOpen(true)}
          className="text-gray-400 hover:text-red-500 font-semibold transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      {/* Logout Confirmation Drawer */}
      <LogoutDrawer
        isOpen={isLogoutDrawerOpen}
        onClose={() => setIsLogoutDrawerOpen(false)}
        onConfirm={handleLogOutFromPin}
      />

      {/* Face ID / Biometrics Bottom Sheet Drawer */}
      <AnimatePresence>
        {showFaceIdModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFaceIdModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
              drag="y"
              dragDirectionLock
              dragConstraints={{ top: 0, bottom: 400 }}
              dragElastic={{ top: 0, bottom: 0.2 }}
              onDragEnd={(_event, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  setShowFaceIdModal(false);
                }
              }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[28px] border-t border-gray-200 p-6 pb-8 z-[100001] flex flex-col items-center select-none cursor-default shadow-none font-hanken"
            >
              {/* Draggable handle bar */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mb-4 cursor-grab active:cursor-grabbing" />

              {/* Drawer Header */}
              <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
                <div className="w-8" />
                <h2 className="font-hanken font-bold text-base text-black text-center">
                  {biometricLabel} Authentication
                </h2>
                <button
                  type="button"
                  onClick={() => setShowFaceIdModal(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              {/* Icon & Badge */}
              <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#FC7A00] flex items-center justify-center mb-3 shadow-inner">
                <span className="material-symbols-outlined text-[36px] font-bold">
                  {biometricType === "faceid" ? "face_6" : "fingerprint"}
                </span>
              </div>

              <p className="font-hanken text-xs text-gray-500 text-center max-w-[290px] mb-6 leading-relaxed font-medium">
                Enable &quot;{biometricLabel} for Login&quot; in Security Settings to use {biometricLabel} directly instead of entering your Access PIN.
              </p>

              <button
                type="button"
                onClick={() => setShowFaceIdModal(false)}
                className="w-full py-4 bg-black hover:bg-gray-900 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-none cursor-pointer border-0"
              >
                Got It
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Full-Screen Hardware-Accelerated Overlay for Forgot PIN recovery */}
      <AnimatePresence>
        {showForgotPin && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ willChange: "transform, opacity" }}
            className="fixed inset-0 w-full h-full bg-white z-[100000+] flex flex-col justify-between overflow-hidden p-6 pb-8"
          >
              <div className="w-full max-w-md mx-auto flex flex-col h-full items-center">
              {/* Header */}
              <div className="w-full flex justify-between items-center border-b border-gray-100 pb-4 mb-6 shrink-0">
                <div className="w-8" />
                <h3 className="font-hanken font-bold text-base text-black text-center">Reset PIN</h3>
                <button
                  type="button"
                  onClick={() => setShowForgotPin(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              {/* Content body with dynamic reset stage rendering */}
              <div className="flex-grow flex flex-col justify-start items-center px-2 text-center w-full overflow-y-auto no-scrollbar">
                {!isForgotContentReady ? (
                  <div className="flex-grow flex items-center justify-center my-auto">
                    <div className="w-8 h-8 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {resetStage === 1 && (
                  <>
                    <div className="w-12 h-12 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] mb-4 shrink-0">
                      <span className="material-symbols-outlined text-[24px] font-bold">lock_reset</span>
                    </div>
                    <h4 className="font-hanken font-bold text-base text-black mb-1">Verify Identity to Reset PIN</h4>
                    <p className="font-hanken text-xs text-gray-500 max-w-[280px] leading-relaxed mb-6">
                      Select your preferred high-security verification provider to recover your Access PIN.
                    </p>

                    {/* Reset options list */}
                    <div className="w-full flex flex-col gap-3 mb-6">
                      {/* Email option card */}
                      <button
                        type="button"
                        onClick={() => setResetOption("email")}
                        className={`w-full p-4 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                          resetOption === "email"
                            ? "border-[#FC7A00] bg-[#FC7A00]/5 ring-1 ring-[#FC7A00]"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          resetOption === "email" ? "bg-[#FC7A00]/20 text-[#FC7A00]" : "bg-gray-100 text-gray-500"
                        }`}>
                          <span className="material-symbols-outlined text-[20px]">mail</span>
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-hanken font-bold text-xs text-black truncate">Email OTP Code</p>
                            <span className="font-mono font-bold text-[10px] text-[#FC7A00] bg-[#FC7A00]/10 px-2 py-0.5 rounded-full shrink-0">
                              {displayEmail}
                            </span>
                          </div>
                          <p className="font-hanken text-[11px] text-gray-400 mt-0.5">Send 6-digit secure code to registered email</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          resetOption === "email" ? "border-[#FC7A00]" : "border-gray-300"
                        }`}>
                          {resetOption === "email" && <div className="w-2.5 h-2.5 rounded-full bg-[#FC7A00]" />}
                        </div>
                      </button>

                      {/* WhatsApp OTP option card */}
                      <button
                        type="button"
                        onClick={() => setResetOption("otp")}
                        className={`w-full p-4 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                          resetOption === "otp"
                            ? "border-[#FC7A00] bg-[#FC7A00]/5 ring-1 ring-[#FC7A00]"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          resetOption === "otp" ? "bg-[#FC7A00]/20 text-[#FC7A00]" : "bg-gray-100 text-gray-500"
                        }`}>
                          <span className="material-symbols-outlined text-[20px]">chat</span>
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-hanken font-bold text-xs text-black truncate">WhatsApp OTP Code</p>
                            <span className="font-mono font-bold text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                              {displayPhone}
                            </span>
                          </div>
                          <p className="font-hanken text-[11px] text-gray-400 mt-0.5">Send 6-digit secure code on WhatsApp</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          resetOption === "otp" ? "border-[#FC7A00]" : "border-gray-300"
                        }`}>
                          {resetOption === "otp" && <div className="w-2.5 h-2.5 rounded-full bg-[#FC7A00]" />}
                        </div>
                      </button>
                    </div>
                  </>
                )}

                {resetStage === 2 && (
                  <div className="w-full flex flex-col items-center space-y-5">
                    <div className="w-12 h-12 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] shrink-0">
                      <span className="material-symbols-outlined text-[24px] font-bold">
                        {resetOption === "email" ? "mail" : "chat"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-hanken font-bold text-base text-black">
                        Enter {resetOption === "email" ? "Email" : "WhatsApp"} OTP
                      </h4>
                      <p className="font-hanken text-xs text-gray-500 max-w-[290px] leading-relaxed">
                        Please enter the secure 6-digit verification code sent to{" "}
                        <span className="font-mono font-bold text-black">
                          {resetOption === "email" ? displayEmail : displayPhone}
                        </span>.
                      </p>
                    </div>

                    {/* 6 Individual OTP Digit Inputs */}
                    <div className="flex gap-2 min-[360px]:gap-2.5 justify-center my-2 w-full max-w-[320px]">
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <input
                          key={idx}
                          ref={(el) => { inputRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={otpDigits[idx]}
                          onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onPaste={handleOtpPaste}
                          className={`w-10 h-12 min-[360px]:w-11 min-[360px]:h-13 bg-white border-2 rounded-xl text-center font-mono font-bold text-lg min-[360px]:text-xl text-black transition-all outline-none ${
                            otpDigits[idx]
                              ? "border-[#FC7A00] bg-[#FC7A00]/5 ring-2 ring-[#FC7A00]/20"
                              : "border-gray-200 focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20"
                          }`}
                        />
                      ))}
                    </div>

                    {otpCooldown > 0 ? (
                      <p className="text-[11px] text-gray-400 font-bold">Resend code in {otpCooldown}s</p>
                    ) : (
                      <button
                        type="button"
                        disabled={isRequestingReset}
                        onClick={handleRequestResetLink}
                        className="text-[11px] text-[#FC7A00] font-bold hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center"
                      >
                        {isRequestingReset ? (
                          <>
                            <div className="w-3 h-3 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          "Resend Code"
                        )}
                      </button>
                    )}
                  </div>
                )}

                {resetStage === 3 && (
                  <div className="w-full flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                      <span className="material-symbols-outlined text-[24px] font-bold">security</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-hanken font-bold text-base text-black">Setup New PIN</h4>
                      <p className="font-hanken text-xs text-gray-500 max-w-[280px] leading-relaxed">
                        Identity successfully verified. Create a new secure 4-digit Access PIN.
                      </p>
                    </div>

                    <div className="w-full space-y-5 pt-2">
                      {/* New 4-Digit PIN Cell Display */}
                      <div className="space-y-1.5 text-left w-full">
                        <label htmlFor="newPinInput" className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          New 4-Digit PIN
                        </label>
                        <div className="relative w-full cursor-pointer" onClick={() => document.getElementById("newPinInput")?.focus()}>
                          <input
                            id="newPinInput"
                            type="password"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            maxLength={4}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                            autoComplete="off"
                          />
                          <div className="grid grid-cols-4 gap-3 w-full">
                            {[0, 1, 2, 3].map((idx) => {
                              const isFilled = newPin.length > idx;
                              const isActive = newPin.length === idx;
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "h-14 sm:h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-black font-hanken transition-all shadow-2xs",
                                    isFilled
                                      ? "border-[#FC7A00] bg-[#FC7A00]/5 text-[#FC7A00]"
                                      : isActive
                                      ? "border-black bg-white ring-2 ring-black/10 scale-[1.02]"
                                      : "border-gray-200 bg-gray-50 text-gray-400"
                                  )}
                                >
                                  {isFilled ? "•" : ""}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Confirm New PIN Cell Display */}
                      <div className="space-y-1.5 text-left w-full">
                        <label htmlFor="confirmNewPinInput" className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          Confirm New PIN
                        </label>
                        <div className="relative w-full cursor-pointer" onClick={() => document.getElementById("confirmNewPinInput")?.focus()}>
                          <input
                            id="confirmNewPinInput"
                            type="password"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            maxLength={4}
                            value={confirmNewPin}
                            onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                            autoComplete="off"
                          />
                          <div className="grid grid-cols-4 gap-3 w-full">
                            {[0, 1, 2, 3].map((idx) => {
                              const isFilled = confirmNewPin.length > idx;
                              const isActive = confirmNewPin.length === idx;
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "h-14 sm:h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-black font-hanken transition-all shadow-2xs",
                                    isFilled
                                      ? "border-[#FC7A00] bg-[#FC7A00]/5 text-[#FC7A00]"
                                      : isActive
                                      ? "border-black bg-white ring-2 ring-black/10 scale-[1.02]"
                                      : "border-gray-200 bg-gray-50 text-gray-400"
                                  )}
                                >
                                  {isFilled ? "•" : ""}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>

              {/* Bottom Buttons depending on resetStage */}
              <div className="w-full flex flex-col gap-3 pt-4 shrink-0">
                {resetStage === 1 && (
                  <button
                    type="button"
                    disabled={isRequestingReset}
                    onClick={handleRequestResetLink}
                    className="w-full py-4 bg-black hover:bg-gray-900 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-none transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isRequestingReset ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {resetOption === "email" ? "Requesting Secured OTP Code..." : "Generating Secure OTP Code..."}
                      </>
                    ) : (
                      resetOption === "email" ? "Request Secured OTP Code" : "Generate Secure OTP Code"
                    )}
                  </button>
                )}

                {resetStage === 2 && (
                  <button
                    type="button"
                    disabled={isVerifyingOtp || otpCode.length !== 6}
                    onClick={handleVerifyOtp}
                    className="w-full py-4 bg-black hover:bg-gray-900 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-none transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Verifying Code...
                      </>
                    ) : (
                      "Verify OTP Code"
                    )}
                  </button>
                )}

                {resetStage === 3 && (
                  <button
                    type="button"
                    disabled={isSavingNewPin || newPin.length !== 4 || confirmNewPin.length !== 4}
                    onClick={handleSaveNewPin}
                    className="w-full py-4 bg-[#FC7A00] hover:brightness-105 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-none transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingNewPin ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Updating PIN...
                      </>
                    ) : (
                      "Save and Use New PIN"
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowForgotPin(false)}
                  className="w-full py-4 bg-white hover:bg-gray-50 active:scale-95 text-black text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-none cursor-pointer premium-gradient-border"
                >
                  Cancel
                </button>
              </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
