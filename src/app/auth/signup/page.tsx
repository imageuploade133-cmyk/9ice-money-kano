"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import Link from "next/link";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import Image from "next/image";
import { AppLogo } from "@/components/AppLogo";
import { cn, formatFirebaseError } from "@/lib/utils";

export default function SignUpPage() {
  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);

  // Personal Info States (Step 1)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bvnNin, setBvnNin] = useState("");

  // Duplicate Account Check state
  const [accountExistsError, setAccountExistsError] = useState<string | null>(null);
  const [isCheckingExists, setIsCheckingExists] = useState(false);

  const checkAccountExists = async (phoneVal: string, bvnNinVal: string, emailVal: string = "") => {
    setIsCheckingExists(true);
    try {
      const res = await fetch("/api/auth/check-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phoneVal,
          bvnNin: bvnNinVal,
          email: emailVal,
        }),
      });
      const data = await res.json();
      if (res.ok && data.exists) {
        setAccountExistsError(data.message);
        return true;
      }
    } catch (err) {
      console.error("Error checking account existence:", err);
    } finally {
      setIsCheckingExists(false);
    }
    return false;
  };

  // Structured Address States (Step 2 is removed/simplified, we can default these safely)
  const [houseNumber, setHouseNumber] = useState("1");
  const [street, setStreet] = useState("Main St");
  const [city, setCity] = useState("Lagos");
  const [state, setState] = useState("Lagos");
  const [country, setCountry] = useState("Nigeria");

  // Account Contact States (Step 2 now)
  const [phonePrefix, setPhonePrefix] = useState("+234");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const handleReferralCodeChange = (raw: string) => {
    const trimmed = raw.toUpperCase().trim();
    if (!trimmed) {
      setReferralCode("");
      return;
    }

    if ((referralCode === "ET-" || referralCode.startsWith("ET-")) && (trimmed === "ET" || trimmed === "E")) {
      setReferralCode("");
      return;
    }

    if (trimmed === "E" || trimmed === "ET" || trimmed === "ET-") {
      setReferralCode("ET-");
      return;
    }

    let body = trimmed;
    if (body.startsWith("ET-")) {
      body = body.slice(3);
    } else if (body.startsWith("ET")) {
      body = body.slice(2);
    }

    const cleanBody = body.replace(/[^A-Z0-9]/g, "");
    if (!cleanBody) {
      setReferralCode("ET-");
    } else {
      setReferralCode(`ET-${cleanBody}`);
    }
  };

  // Email Domain Typo Resolver & Vibration Feedback
  const checkEmailTypo = (emailStr: string): string | null => {
    if (!emailStr || !emailStr.includes("@")) return null;
    const parts = emailStr.trim().toLowerCase().split("@");
    if (parts.length !== 2) return null;

    const [username, domain] = parts;
    if (!domain) return null;

    const gmailTypos = [
      "gamil.com", "glmail.com", "gmaill.com", "gmail.co", "gmai.com",
      "gmeil.com", "gmail.con", "gamil.co", "gmial.com", "gmal.com",
      "gmai.co", "gmaill.co", "gamil.net", "gmai.net", "gmail.cm"
    ];
    const yahooTypos = [
      "yahou.com", "yaho.com", "yahoo.co", "yaho.co", "yaho0.com",
      "yaho.com.ng", "yaho.org", "yahoomail.co"
    ];
    const hotmailTypos = [
      "hotmial.com", "hotmai.com", "hotmal.com", "hotmail.co", "hotmial.co"
    ];
    const outlookTypos = [
      "outlok.com", "outlook.co", "outloook.com", "outlok.co"
    ];
    const icloudTypos = [
      "icoud.com", "iclud.com", "icloud.co", "icloude.com"
    ];

    if (gmailTypos.includes(domain)) return `${username}@gmail.com`;
    if (yahooTypos.includes(domain)) return `${username}@yahoo.com`;
    if (hotmailTypos.includes(domain)) return `${username}@hotmail.com`;
    if (outlookTypos.includes(domain)) return `${username}@outlook.com`;
    if (icloudTypos.includes(domain)) return `${username}@icloud.com`;

    return null;
  };

  const suggestedEmail = checkEmailTypo(email);

  // OTP Verification Channel Selector States ("whatsapp" | "email")
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [isOtpRequested, setIsOtpRequested] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpInputsRef = React.useRef<(HTMLInputElement | null)[]>([]);
  const otpCode = otpDigits.join("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState("");

  const handleOtpDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, "");
    if (!cleanVal) {
      const updated = [...otpDigits];
      updated[index] = "";
      setOtpDigits(updated);
      setOtpError("");
      return;
    }
    const lastChar = cleanVal.slice(-1);
    const updated = [...otpDigits];
    updated[index] = lastChar;
    setOtpDigits(updated);
    setOtpError("");

    if (index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setOtpDigits(updated);
    setOtpError("");

    const nextFocusIndex = Math.min(pasted.length, 5);
    otpInputsRef.current[nextFocusIndex]?.focus();
  };

  // Cooldown countdown timer for OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Reset verification states if contact parameters or channel change
  useEffect(() => {
    setIsOtpVerified(false);
    setIsOtpRequested(false);
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError("");
  }, [phonePrefix, phoneNumber, email, otpChannel]);

  const handleRequestOtp = async (targetChannel: "whatsapp" | "email" = otpChannel) => {
    if (isSendingOtp || otpCooldown > 0) return;

    if (targetChannel === "whatsapp") {
      if (!phoneNumber || phoneNumber.trim().length === 0) {
        toast.error("Please enter your phone number first.");
        return;
      }

      let cleanPhone = phoneNumber.trim().replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) {
        cleanPhone = cleanPhone.slice(1);
      }

      const requiredLength = phonePrefix === "+234" ? 10 : 8;
      if (cleanPhone.length < requiredLength) {
        toast.error(`The phone number you entered is not up to the correct number of digits (should be exactly ${requiredLength} digits for ${phonePrefix === "+234" ? "Nigeria" : "Niger"}).`);
        return;
      }
    } else {
      if (!email || !email.includes("@")) {
        toast.error("Please enter a valid email address first.");
        return;
      }
    }

    setIsSendingOtp(true);
    setOtpError("");

    let cleanPhone = phoneNumber.trim().replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: targetChannel,
          phonePrefix,
          phoneNumber: cleanPhone,
          email: email.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Failed to send OTP.");
        toast.error(data.error || "Failed to send OTP.");
      } else {
        setIsOtpRequested(true);
        setOtpCooldown(60);
        toast.success(data.message || `Verification code sent to ${targetChannel === "whatsapp" ? "WhatsApp" : "Email"}!`);
        setTimeout(() => {
          otpInputsRef.current[0]?.focus();
        }, 150);
      }
    } catch (err) {
      console.error("Error sending OTP:", err);
      toast.error("Failed to connect to the server.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP code.");
      return;
    }

    let cleanPhone = phoneNumber.trim().replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }

    setIsVerifyingOtp(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: otpChannel,
          phonePrefix,
          phoneNumber: cleanPhone,
          email: email.trim().toLowerCase(),
          otpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Incorrect code or verification failed.");
        toast.error(data.error || "Incorrect code.");
      } else {
        setIsOtpVerified(true);
        toast.success(data.message || "Account contact verified successfully!");
      }
    } catch (err) {
      console.error("Error verifying OTP:", err);
      toast.error("Failed to verify code.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Account Security States (Step 3 now)
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showWeakPasswordModal, setShowWeakPasswordModal] = useState(false);
  const [hasConfirmedWeakPassword, setHasConfirmedWeakPassword] = useState(false);

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [photo, setPhoto] = useState<string | null>("https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M");
  const [loading, setLoading] = useState(false);
  const [termsError, setTermsError] = useState("");

  // Custom Permission Drawer state (not used anymore but kept to avoid broken references)
  const [showPermissionDrawer, setShowPermissionDrawer] = useState(false);

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  // Ripple Effect State
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const hasPushedState = useRef(false);

  // Auto-set Prefix based on country selection
  useEffect(() => {
    if (country === "Nigeria") {
      setPhonePrefix("+234");
    } else if (country === "Niger") {
      setPhonePrefix("+227");
    }
  }, [country]);

  // Password Strength Calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "None", color: "bg-gray-200" };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[@$!%*?&]/.test(pass)) score++;

    switch (score) {
      case 1:
        return { score: 1, label: "Very Weak", color: "bg-red-500" };
      case 2:
        return { score: 2, label: "Weak", color: "bg-orange-500" };
      case 3:
        return { score: 3, label: "Medium", color: "bg-yellow-500" };
      case 4:
        return { score: 4, label: "Strong", color: "bg-blue-500" };
      case 5:
        return { score: 5, label: "Excellent", color: "bg-green-500" };
      default:
        return { score: 0, label: "None", color: "bg-gray-200" };
    }
  };

  const pStrength = getPasswordStrength(password);

  // Stop Camera Stream (No-op but kept for refs)
  const stopCamera = React.useCallback(() => {
    setShowCamera(false);
  }, []);

  // Create Ripple Effect
  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  // Stage-by-Stage validation and navigation handlers
  const handleNextStep = async () => {
    if (currentStep === 1) {
      if (!firstName || firstName.trim().length < 2) {
        toast.error("First name must be at least 2 characters.");
        return;
      }
      if (!lastName || lastName.trim().length < 2) {
        toast.error("Last name must be at least 2 characters.");
        return;
      }

      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!phoneNumber || phoneNumber.trim().length === 0) {
        toast.error("Phone number is required.");
        return;
      }

      let cleanPhoneVal = phoneNumber.trim().replace(/\D/g, "");
      if (cleanPhoneVal.startsWith("0")) {
        cleanPhoneVal = cleanPhoneVal.slice(1);
      }

      const requiredLength = phonePrefix === "+234" ? 10 : 8;
      if (cleanPhoneVal.length < requiredLength) {
        toast.error(`The phone number you entered is not up to the correct number of digits (should be exactly ${requiredLength} digits for ${phonePrefix === "+234" ? "Nigeria" : "Niger"}).`);
        return;
      }

      if (!email || !email.includes("@")) {
        toast.error("Please provide a valid email address.");
        return;
      }

      const emailCorrection = checkEmailTypo(email);
      if (emailCorrection && emailCorrection !== email) {
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate([100, 50, 100]); } catch {}
        }
        toast.warning(`Typo detected in email! Did you mean ${emailCorrection}? Tap 'Fix Email' below.`);
        return;
      }

      if (!isOtpVerified) {
        toast.error("Please verify your contact with the OTP code first.");
        return;
      }

      // Check if phone number already exists before proceeding!
      const fullPhone = `${phonePrefix}${cleanPhoneVal}`;
      const alreadyExists = await checkAccountExists(fullPhone, bvnNin, email);
      if (alreadyExists) return;

      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTermsError("");

    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      setTermsError("You must accept both the Terms & Conditions and Privacy Policy.");
      toast.error("Please accept both the Terms and Privacy Policy.");
      return;
    }

    // Check if password is weak (doesn't meet full strong requirements)
    const isStrongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);
    if (!isStrongPassword && !hasConfirmedWeakPassword) {
      setShowWeakPasswordModal(true);
      return;
    }

    setLoading(true);

    try {
      // 1. Call secure server-side validation endpoint
      const validateRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          dateOfBirth: "2000-01-01",
          houseNumber,
          street,
          city,
          state,
          country,
          postalCode: "",
          phonePrefix,
          phoneNumber,
          email,
          password,
          acceptedTerms,
          acceptedPrivacy,
          acceptedTermsVersion: "v1.0.0",
          acceptedPrivacyVersion: "v1.0.0",
        }),
      });

      const validateData = await validateRes.json();
      if (!validateRes.ok || !validateData.success) {
        toast.error(validateData.error || "Server validation failed.");
        setLoading(false);
        return;
      }

      // 2. Create standard Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      await updateProfile(user, { displayName: fullName, photoURL: photo });

      // 3. Call secure server-side endpoint to save the complete record
      const idToken = await user.getIdToken();
      const completeRes = await fetch("/api/auth/register-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          dateOfBirth: "2000-01-01",
          houseNumber,
          street,
          city,
          state,
          country,
          postalCode: null,
          phonePrefix,
          phoneNumber,
          email,
          referralCode,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData.success) {
        toast.error(completeData.error || "Failed to complete registration on database.");
        setLoading(false);
        return;
      }

      toast.success("Account created successfully!");
      router.push("/auth/pin-setup");
    } catch (error: unknown) {
      console.error("Signup Error:", error);
      const friendlyMessage = formatFirebaseError(error);
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white p-6 justify-center text-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl mx-auto"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative w-14 h-14 mb-2 flex items-center justify-center">
            <AppLogo size={48} />
          </div>
          <h1 className="font-hanken font-bold text-xl tracking-tight text-black">E-Global Pay</h1>
          <p className="text-gray-500 font-hanken mt-1 text-[11px] font-semibold">Stage-by-Stage Premium Account Setup</p>
        </div>

        {/* Wizard Progress Bar & Step Indicators */}
        <div className="mb-8 max-w-md mx-auto">
          <div className="flex justify-between items-center relative mb-2">
            {/* Background progress bar line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-gray-150 z-0 rounded-full" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] z-0 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
            />

            {[1, 2, 3].map((sIndex) => {
              const isActive = currentStep === sIndex;
              const isCompleted = currentStep > sIndex;
              return (
                <button
                  key={sIndex}
                  type="button"
                  onClick={() => {
                    // Prevent skip-ahead without stage validation
                    if (sIndex < currentStep) {
                      setCurrentStep(sIndex);
                    }
                  }}
                  disabled={sIndex > currentStep}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-hanken text-xs font-black z-10 transition-all duration-300 shadow-sm border",
                    isCompleted
                      ? "bg-[#FC7A00] border-[#FC7A00] text-white"
                      : isActive
                      ? "bg-white border-black text-black scale-110"
                      : "bg-white border-gray-250 text-gray-400"
                  )}
                >
                  {isCompleted ? "✓" : sIndex}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase px-1">
            <span className={cn(currentStep === 1 && "text-[#FC7A00]")}>Personal</span>
            <span className={cn(currentStep === 2 && "text-[#FC7A00]")}>Contact</span>
            <span className={cn(currentStep === 3 && "text-[#FC7A00]")}>Security</span>
          </div>
        </div>

        <form onSubmit={handleSignUp} className="space-y-6" autoComplete="on">
          <AnimatePresence mode="wait">
            {/* STEP 1: Personal Details */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5"
              >
                {/* First & Last Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 text-left">
                    <label htmlFor="firstName" className="text-[10px] font-black uppercase tracking-widest text-gray-400">First Name <span className="text-red-500">*</span></label>
                    <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                      <input
                        id="firstName"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                        placeholder="John"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label htmlFor="lastName" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Last Name <span className="text-red-500">*</span></label>
                    <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                      <input
                        id="lastName"
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* STEP 2: Contact details */}
            {currentStep === 2 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5"
              >
                {/* Contact Inputs */}
                <div className="space-y-4">
                  {/* Phone Input */}
                  <div className="space-y-1.5 text-left">
                    <label htmlFor="phoneNumber" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phone Number <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                        <select
                          id="phonePrefix"
                          value={phonePrefix}
                          onChange={(e) => setPhonePrefix(e.target.value)}
                          className="bg-white border-0 rounded-[14px] px-3.5 py-3.5 outline-none text-xs font-black text-black appearance-none cursor-pointer"
                          aria-label="Phone Prefix"
                        >
                          <option value="+234">🇳🇬 +234</option>
                          <option value="+227">🇳🇪 +227</option>
                        </select>
                      </div>
                      <div className="flex-grow p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                        <input
                          id="phoneNumber"
                          type="tel"
                          required
                          value={phoneNumber}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, "");
                            if (val.startsWith("0")) {
                              val = val.slice(1);
                            }
                            setPhoneNumber(val);
                          }}
                          className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none font-mono"
                          placeholder="8012345678"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Email Address Input */}
                  <div className="space-y-1.5 text-left">
                    <label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email Address <span className="text-red-500">*</span></label>
                    <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEmail(val);
                          const typoFix = checkEmailTypo(val);
                          if (typoFix && typoFix !== val) {
                            if (typeof window !== "undefined" && "vibrate" in navigator) {
                              try { navigator.vibrate([100, 50, 100]); } catch {}
                            }
                          }
                        }}
                        className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                        placeholder="doe@example.com"
                      />
                    </div>

                    {/* Email Typo Notification & One-Tap Fix Banner */}
                    {suggestedEmail && suggestedEmail !== email && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-xs mt-2"
                      >
                        <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold">
                          <span className="material-symbols-outlined text-amber-600 text-base animate-pulse">error_med</span>
                          <span className="text-[11px]">
                            Did you mean <strong className="font-mono text-black">{suggestedEmail}</strong>?
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEmail(suggestedEmail);
                            toast.success(`Email updated to ${suggestedEmail}`);
                          }}
                          className="px-3 py-1.5 bg-[#FC7A00] hover:brightness-105 active:scale-95 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-xs">auto_fix</span>
                          <span>Fix Email</span>
                        </button>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Interactive Dual-Channel Verification Method Selector */}
                <div className="space-y-3 text-left pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Choose Verification Method <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* WhatsApp Channel Card */}
                    <button
                      type="button"
                      onClick={() => setOtpChannel("whatsapp")}
                      className={cn(
                        "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-xs",
                        otpChannel === "whatsapp"
                          ? "bg-[#FC7A00]/10 border-[#FC7A00] text-[#FC7A00] ring-1 ring-[#FC7A00]"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="material-symbols-outlined text-xl">chat</span>
                        {otpChannel === "whatsapp" && (
                          <span className="material-symbols-outlined text-base">check_circle</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold">WhatsApp OTP</p>
                        <p className="text-[9.5px] opacity-80 font-medium">Verify via WhatsApp</p>
                      </div>
                    </button>

                    {/* Email Channel Card */}
                    <button
                      type="button"
                      onClick={() => setOtpChannel("email")}
                      className={cn(
                        "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-xs",
                        otpChannel === "email"
                          ? "bg-[#FC7A00]/10 border-[#FC7A00] text-[#FC7A00] ring-1 ring-[#FC7A00]"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="material-symbols-outlined text-xl">mail</span>
                        {otpChannel === "email" && (
                          <span className="material-symbols-outlined text-base">check_circle</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-extrabold">Email OTP</p>
                        <p className="text-[9.5px] opacity-80 font-medium">Verify via Email</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* OTP Request and Verify Control Panel */}
                {!isOtpVerified ? (
                  <div className="space-y-4 text-left bg-gray-50/80 border border-gray-200 p-4 sm:p-5 rounded-2xl shadow-xs">
                    {!isOtpRequested ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#FC7A00]/15 flex items-center justify-center text-[#FC7A00] shrink-0">
                            <span className="material-symbols-outlined text-[16px] font-bold">
                              {otpChannel === "whatsapp" ? "chat" : "mail"}
                            </span>
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-800">
                              {otpChannel === "whatsapp" ? "WhatsApp Verification" : "Email Verification"}
                            </p>
                            <p className="text-[10px] text-gray-500 font-semibold">
                              Send code to{" "}
                              <span className="font-mono text-black font-bold">
                                {otpChannel === "whatsapp" ? `${phonePrefix} ${phoneNumber || "your phone number"}` : (email || "your email address")}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Animated Loading Feedback Banner when sending OTP */}
                        {isSendingOtp ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3 animate-pulse">
                            <div className="w-5 h-5 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin shrink-0" />
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-black uppercase tracking-wide text-amber-900">
                                Dispatching {otpChannel === "whatsapp" ? "WhatsApp" : "Email"} OTP...
                              </p>
                              <p className="text-[10px] text-amber-800 font-medium">
                                Please wait while we dispatch your verification code.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={otpChannel === "whatsapp" ? !phoneNumber : !email}
                            onClick={(e) => {
                              handleButtonClick(e);
                              handleRequestOtp(otpChannel);
                            }}
                            className="relative overflow-hidden w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-98 text-white font-black py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {ripples.map((ripple) => (
                              <span
                                key={ripple.id}
                                className="absolute bg-white/30 rounded-full pointer-events-none animate-ripple"
                                style={{
                                  left: ripple.x,
                                  top: ripple.y,
                                  width: 100,
                                  height: 100,
                                  transform: "translate(-50%, -50%)",
                                }}
                              />
                            ))}
                            <span className="material-symbols-outlined text-[18px] font-bold">send</span>
                            <span>Send OTP via {otpChannel === "whatsapp" ? "WhatsApp" : "Email"}</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-[#FC7A00] font-bold">mark_email_read</span>
                            <p className="text-[11px] font-black uppercase tracking-wider text-black">
                              Enter {otpChannel === "whatsapp" ? "WhatsApp" : "Email"} OTP
                            </p>
                          </div>
                          {otpCooldown > 0 ? (
                            <span className="text-[10px] text-gray-500 font-mono font-bold bg-gray-200/60 px-2 py-0.5 rounded-full">Resend in {otpCooldown}s</span>
                          ) : (
                            <button
                              type="button"
                              disabled={isSendingOtp}
                              onClick={() => handleRequestOtp(otpChannel)}
                              className="text-[10px] text-[#FC7A00] hover:underline font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {isSendingOtp ? (
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

                        <p className="text-[10px] text-gray-500 font-medium">
                          Enter the 6-digit code sent to{" "}
                          <span className="font-mono text-black font-bold">
                            {otpChannel === "whatsapp" ? `${phonePrefix} ${phoneNumber}` : email}
                          </span>.
                        </p>

                        <div className="space-y-3">
                          {/* 6 Individual OTP Digit Inputs */}
                          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                            {[0, 1, 2, 3, 4, 5].map((idx) => (
                              <div key={idx} className="p-[1.5px] rounded-xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                                <input
                                  ref={(el) => {
                                    otpInputsRef.current[idx] = el;
                                  }}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={1}
                                  value={otpDigits[idx]}
                                  disabled={isVerifyingOtp}
                                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                  onPaste={handleOtpPaste}
                                  className="w-9 h-11 sm:w-10 sm:h-12 bg-white rounded-[10px] text-center font-mono font-black text-lg text-black outline-none border-0"
                                />
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            disabled={isVerifyingOtp || otpCode.length !== 6}
                            onClick={(e) => {
                              handleButtonClick(e);
                              handleVerifyOtp();
                            }}
                            className="relative overflow-hidden w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white hover:brightness-105 active:scale-98 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                          >
                            {isVerifyingOtp ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Verifying OTP Code...</span>
                              </>
                            ) : (
                              "Verify OTP Code"
                            )}
                          </button>
                        </div>

                        {otpError && (
                          <p className="text-[10px] text-red-500 font-bold bg-red-50 border border-red-200 p-2 rounded-xl text-center">{otpError}</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-emerald-800 text-left shadow-xs">
                    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                      <span className="material-symbols-outlined text-[18px] font-bold">verified</span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-black uppercase tracking-wider">
                        {otpChannel === "whatsapp" ? "WhatsApp Number Verified" : "Email Address Verified"}
                      </p>
                      <p className="text-[10px] text-emerald-700 font-semibold leading-tight">
                        Your account contact details are successfully verified.
                      </p>
                    </div>
                  </div>
                )}

                {/* Referral Account ID */}
                <div className="space-y-1.5 text-left">
                  <label htmlFor="referralCode" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Referral Account ID (Optional)</label>
                  <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs">
                    <input
                      id="referralCode"
                      type="text"
                      value={referralCode}
                      onChange={(e) => handleReferralCodeChange(e.target.value)}
                      className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none font-mono"
                      placeholder="e.g. ET-XXXXXX (or enter numbers directly)"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Security details */}
            {currentStep === 3 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-5"
              >
                {/* Passwords */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 text-left">
                    <label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Password <span className="text-red-500">*</span></label>
                    <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FC7A00] cursor-pointer transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {showPassword ? "visibility" : "visibility_off"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label htmlFor="confirmPassword" className="text-[10px] font-black uppercase tracking-widest text-gray-400">Confirm Password <span className="text-red-500">*</span></label>
                    <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] focus-within:ring-2 focus-within:ring-[#FC7A00]/30 transition-all shadow-xs relative">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-white border-0 rounded-[14px] px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FC7A00] cursor-pointer transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {showConfirmPassword ? "visibility" : "visibility_off"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Strength Guidance & Requirement Checklist */}
                <div className="space-y-3 text-left bg-gray-50 p-4 rounded-2xl border border-gray-200 shadow-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Password Strength</span>
                    <span className={cn("text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full text-white shadow-xs", pStrength.color)}>
                      {pStrength.label}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-300 rounded-full", pStrength.color)}
                      style={{ width: `${(pStrength.score / 5) * 100}%` }}
                    />
                  </div>

                  {/* Interactive Requirement Checklist */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Password Requirements</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-semibold">
                      {[
                        { label: "8+ characters", valid: password.length >= 8 },
                        { label: "Uppercase letter (A-Z)", valid: /[A-Z]/.test(password) },
                        { label: "Lowercase letter (a-z)", valid: /[a-z]/.test(password) },
                        { label: "Numeric digit (0-9)", valid: /\d/.test(password) },
                        { label: "Special character (@$!%*?&#)", valid: /[@$!%*?&]/.test(password) },
                      ].map((req, rIdx) => (
                        <div
                          key={rIdx}
                          className={cn(
                            "flex items-center gap-1.5 transition-colors",
                            req.valid ? "text-emerald-700 font-bold" : "text-gray-400"
                          )}
                        >
                          <span className={cn("material-symbols-outlined text-[14px]", req.valid ? "text-emerald-600 font-bold" : "text-gray-300")}>
                            {req.valid ? "check_circle" : "cancel"}
                          </span>
                          <span>{req.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Terms checkbox */}
                <div className="space-y-3 text-left pt-2">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="termsCheck"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="w-4.5 h-4.5 rounded border-gray-300 text-[#FC7A00] focus:ring-[#FC7A00] cursor-pointer mt-0.5"
                    />
                    <label htmlFor="termsCheck" className="text-xs text-gray-600 font-semibold select-none leading-relaxed">
                      I agree to the{" "}
                      <Link href="/auth/terms" className="text-[#FC7A00] hover:underline font-bold">
                        Terms & Conditions
                      </Link> (v1.0.0).
                    </label>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="privacyCheck"
                      checked={acceptedPrivacy}
                      onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                      className="w-4.5 h-4.5 rounded border-gray-300 text-[#FC7A00] focus:ring-[#FC7A00] cursor-pointer mt-0.5"
                    />
                    <label htmlFor="privacyCheck" className="text-xs text-gray-600 font-semibold select-none leading-relaxed">
                      I agree to the{" "}
                      <Link href="/auth/privacy" className="text-[#FC7A00] hover:underline font-bold">
                        Privacy Policy
                      </Link> (v1.0.0).
                    </label>
                  </div>

                  {termsError && (
                    <p className="text-[10px] text-red-500 font-bold text-left animate-pulse">{termsError}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Controls Bar */}
          <div className="flex gap-4 pt-4">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  handleButtonClick(e);
                  handlePrevStep();
                }}
                className="relative overflow-hidden flex-1 py-4 bg-white border border-black hover:bg-gray-50 active:scale-95 text-black text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-none cursor-pointer text-center"
              >
                Back
              </button>
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={(e) => {
                  handleButtonClick(e);
                  handleNextStep();
                }}
                className="relative overflow-hidden flex-grow py-4 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-110 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-none cursor-pointer flex items-center justify-center gap-1.5"
              >
                {ripples.map((ripple) => (
                  <span
                    key={ripple.id}
                    className="absolute bg-white/30 rounded-full pointer-events-none animate-ripple"
                    style={{
                      left: ripple.x,
                      top: ripple.y,
                      width: 100,
                      height: 100,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
                Next Step
                <span className="material-symbols-outlined text-[16px] font-bold">chevron_right</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                onClick={handleButtonClick}
                className="flex-grow relative overflow-hidden bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-110 text-white py-4 rounded-xl border border-white/10 font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2.5 shadow-none"
              >
                {/* Ripple Elements */}
                {ripples.map((ripple) => (
                  <span
                    key={ripple.id}
                    className="absolute bg-white/30 rounded-full pointer-events-none animate-ripple"
                    style={{
                      left: ripple.x,
                      top: ripple.y,
                      width: 100,
                      height: 100,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}

                {loading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                    />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            )}
          </div>
        </form>

        {/* Global Checking Database Loader Overlay */}
        <AnimatePresence>
          {isCheckingExists && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-white/80 backdrop-blur-xs z-[99999] flex flex-col items-center justify-center p-6"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-10 h-10 rounded-full border-3 border-gray-200 border-t-[#FC7A00]"
              />
              <p className="mt-4 font-hanken font-bold text-xs tracking-wider uppercase text-gray-800">
                Verifying Credentials...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Account Already Exists Full Screen Premium Warning Overlay */}
        <AnimatePresence>
          {accountExistsError && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="fixed inset-0 bg-white z-[99999] flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto text-black"
            >
              <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
                {/* Brand Logo */}
                <div className="relative w-16 h-14 mb-2 flex items-center justify-center">
                  <AppLogo size={52} />
                </div>

                {/* Warning Icon */}
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-[#FC7A00] border border-amber-200 shadow-sm animate-bounce">
                  <span className="material-symbols-outlined text-[36px] font-bold">warning</span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-hanken font-extrabold text-lg tracking-tight text-black uppercase">Account Already Exists</h3>
                  <p className="text-gray-500 font-hanken text-[10px] font-bold uppercase tracking-wider">Stage-by-Stage Security Validation</p>
                </div>

                <div className="w-full bg-gray-50 border border-gray-150 p-5 rounded-[24px] text-left">
                  <p className="font-hanken text-xs text-gray-700 leading-relaxed font-semibold">
                    {accountExistsError}
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountExistsError(null);
                      router.push("/auth/login");
                    }}
                    className="w-full py-4 bg-black hover:bg-gray-900 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-sm text-center"
                  >
                    Login to your Account
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountExistsError(null);
                      router.push("/auth/login?forgot=true");
                    }}
                    className="w-full py-4 bg-[#FC7A00] hover:brightness-105 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-sm text-center"
                  >
                    Reset Password or PIN
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountExistsError(null)}
                    className="w-full py-4 bg-white hover:bg-gray-50 active:scale-95 text-black text-xs font-bold uppercase tracking-widest rounded-2xl transition-all cursor-pointer border border-black/15 shadow-xs text-center"
                  >
                    Use Different Details
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-8 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-[#FC7A00] font-bold underline">
            Login
          </Link>
        </p>
      </motion.div>

      {/* Weak Password Confirmation Modal */}
      <AnimatePresence>
        {showWeakPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[999999] flex items-center justify-center p-4 font-hanken"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-5 border border-gray-100 shadow-xl text-black"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#FC7A00] mx-auto">
                <span className="material-symbols-outlined text-[32px]">shield_lock</span>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-extrabold text-base text-gray-900 uppercase tracking-tight">Weak Password Warning</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                  Your chosen password does not meet our recommended strong password guidelines (8+ characters with uppercase, lowercase, numbers, and symbols).
                </p>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl text-left text-[11px] text-amber-900 font-semibold space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-amber-600">info</span>
                  Security Recommendation
                </p>
                <p>Using a weak password increases the risk of unauthorized access. Are you sure you want to proceed with this password?</p>
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowWeakPasswordModal(false);
                    setHasConfirmedWeakPassword(true);
                    // Trigger signup again with confirmed weak password
                    setTimeout(() => {
                      const form = document.querySelector("form");
                      if (form) form.requestSubmit();
                    }, 50);
                  }}
                  className="w-full py-3.5 bg-[#FC7A00] hover:brightness-105 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-sm"
                >
                  Agree & Continue with Weak Password
                </button>

                <button
                  type="button"
                  onClick={() => setShowWeakPasswordModal(false)}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:scale-98 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                >
                  Improve Password
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
