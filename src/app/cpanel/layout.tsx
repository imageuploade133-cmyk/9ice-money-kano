"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { CpanelThemeProvider, useCpanelTheme } from "@/lib/CpanelThemeContext";
import { hasAdminPermission } from "@/lib/admin-permissions-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  exact?: boolean;
  category?: string;
  badge?: number;
  permission?: string;
}

function CpanelLayoutContent({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const { isDark } = useCpanelTheme();
  const pathname = usePathname();
  const router = useRouter();

  // Admin lock validation
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("admin_session_unlocked") === "true";
    }
    return false;
  });
  const [adminUser, setAdminUser] = useState<{ role?: string; permissions?: string[] } | null>(null);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [resetPhone, setResetPhone] = useState("");
  const [resetOtpDigits, setResetOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const adminOtpInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const resetOtp = resetOtpDigits.join("");
  const [adminOtpCooldown, setAdminOtpCooldown] = useState(0);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isDispatchingResetEmail, setIsDispatchingResetEmail] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Admin Reset Password OTP Cooldown Countdown
  useEffect(() => {
    if (adminOtpCooldown <= 0) return;
    const timer = setInterval(() => {
      setAdminOtpCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [adminOtpCooldown]);

  const handleAdminOtpDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, "");
    if (!cleanVal) {
      const updated = [...resetOtpDigits];
      updated[index] = "";
      setResetOtpDigits(updated);
      return;
    }
    const lastChar = cleanVal.slice(-1);
    const updated = [...resetOtpDigits];
    updated[index] = lastChar;
    setResetOtpDigits(updated);

    if (index < 5) {
      adminOtpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleAdminOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !resetOtpDigits[index] && index > 0) {
      adminOtpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleAdminOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setResetOtpDigits(updated);

    const nextFocusIndex = Math.min(pasted.length, 5);
    adminOtpInputsRef.current[nextFocusIndex]?.focus();
  };

  const maskPhoneForAdmin = (p: string) => {
    const clean = p.replace(/\D/g, "");
    if (clean.length < 8) return p;
    return clean.slice(0, 4) + "***" + clean.slice(-2);
  };

  // Session / Permission loading state for skeleton rendering
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Sidebar state & Notification Badge counts state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isStoreExpanded, setIsStoreExpanded] = useState(pathname.startsWith("/cpanel/store"));
  const [isEstateExpanded, setIsEstateExpanded] = useState(pathname.startsWith("/cpanel/estate"));
  const [sidebarCounts, setSidebarCounts] = useState<Record<string, number>>({});

  // Fetch slide menu notification counts across KYC, limits, held deposits, estate, store orders & reviews
  useEffect(() => {
    const fetchSidebarCounts = async () => {
      try {
        const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
        const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
        const res = await fetch("/api/admin/sidebar-counts", { headers });
        const data = await res.json();
        if (data.success && data.counts) {
          setSidebarCounts(data.counts);
        }
      } catch {
        // Ignore background polling errors
      }
    };

    if (isAdminUnlocked) {
      fetchSidebarCounts();
      const interval = setInterval(fetchSidebarCounts, 30000); // Polling every 30s for low reads

      const handleSidebarUpdated = () => fetchSidebarCounts();
      window.addEventListener("cpanel_sidebar_updated", handleSidebarUpdated);
      window.addEventListener("cpanel_reviews_updated", handleSidebarUpdated);

      return () => {
        clearInterval(interval);
        window.removeEventListener("cpanel_sidebar_updated", handleSidebarUpdated);
        window.removeEventListener("cpanel_reviews_updated", handleSidebarUpdated);
      };
    }
  }, [isAdminUnlocked]);

  useEffect(() => {
    if (pathname.startsWith("/cpanel/store")) {
      setIsStoreExpanded(true);
    }
  }, [pathname]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Check cookie-based admin session on mount
  useEffect(() => {
    const checkCPanelSession = async () => {
      setIsLoadingSession(true);
      try {
        const res = await fetch("/api/admin/auth/session");
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          setIsAdminUnlocked(true);
          setAdminEmail(data.user.email);
          setAdminUser({ role: data.user.role, permissions: data.user.permissions });
          if (typeof window !== "undefined") {
            sessionStorage.setItem("admin_session_unlocked", "true");
          }
        } else {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          if (!isMock) {
            setIsAdminUnlocked(false);
            setAdminUser(null);
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("admin_session_unlocked");
            }
          } else {
            setIsAdminUnlocked(true);
            setAdminUser({ role: "super_admin", permissions: ["*"] });
          }
        }
      } catch (err) {
        console.warn("No active admin cookie session found on mount:", err);
      } finally {
        setIsLoadingSession(false);
      }
    };
    checkCPanelSession();
  }, []);

  // Pre-fill admin email when user loads
  useEffect(() => {
    if (user?.email && !adminEmail) {
      setAdminEmail(user.email);
    }
  }, [user, adminEmail]);

  const handleAdminVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPin(true);

    const cleanEmail = adminEmail.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Please enter your administrator email address.");
      setIsVerifyingPin(false);
      return;
    }

    if (!adminPassword) {
      toast.error("Please enter your administrator password.");
      setIsVerifyingPin(false);
      return;
    }

    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");

      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, adminPassword);
      const firebaseUser = userCredential.user;
      const idToken = await firebaseUser.getIdToken(true);

      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: cleanEmail, idToken }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminUnlocked(true);
        if (data.user) {
          setAdminUser({ role: data.user.role, permissions: data.user.permissions });
        }
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin_session_unlocked", "true");
        }
        toast.success(data.message || "Administrator Authentication Granted!");
      } else {
        toast.error(data.error || "Access Denied: Account is not an authorized administrator.");
      }
    } catch (err: any) {
      console.error("[CPanel Admin Auth Error]:", err);
      let errMsg = "Administrator Authentication Failed.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        errMsg = "Invalid administrator Email or Password.";
      } else if (err.code === "auth/too-many-requests") {
        errMsg = "Too many failed attempts. Please try again later.";
      } else if (err.message) {
        errMsg = err.message;
      }
      toast.error(errMsg);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleRequestResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanPhone = resetPhone.trim();

    if (!cleanEmail || !cleanPhone) {
      toast.error("Please enter both email and phone number.");
      return;
    }

    if (isRequestingOtp || adminOtpCooldown > 0) return;

    setIsRequestingOtp(true);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_otp",
          email: cleanEmail,
          phoneNumber: cleanPhone,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Phone OTP sent successfully!");
        if (data.devOtp) setOtpDevCode(data.devOtp);
        setAdminOtpCooldown(60);
        setResetOtpDigits(["", "", "", "", "", ""]);
        setResetStep(2);
      } else {
        toast.error(data.error || "Failed to request password reset OTP.");
      }
    } catch {
      toast.error("Network communication failure requesting OTP.");
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanOtp = resetOtp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      toast.error("Please enter the 6-digit OTP code.");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_otp",
          email: cleanEmail,
          otp: cleanOtp,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Phone OTP verified!");
        setResetStep(3);
      } else {
        toast.error(data.error || "Invalid or expired OTP code.");
      }
    } catch {
      toast.error("Network communication failure verifying OTP.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleDispatchResetEmail = async () => {
    const cleanEmail = adminEmail.trim().toLowerCase();
    setIsDispatchingResetEmail(true);

    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_reset_email", email: cleanEmail }),
      });
      const data = await res.json();

      const { sendPasswordResetEmail } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");

      await sendPasswordResetEmail(auth, cleanEmail);

      toast.success(data.message || "Official password recovery email sent! Check your inbox.");
      setIsResetPasswordMode(false);
      setResetStep(1);
      setResetPhone("");
      setResetOtpDigits(["", "", "", "", "", ""]);
      setOtpDevCode(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to send password recovery email.");
    } finally {
      setIsDispatchingResetEmail(false);
    }
  };

  interface NavCategory {
    title: string;
    items: NavItem[];
  }

  const navCategories: NavCategory[] = [
    {
      title: "System Overview",
      items: [
        { id: "profile", label: "My Admin Profile", icon: "account_circle", href: "/cpanel/profile" },
        { id: "dashboard", label: "Metrics & Operations", icon: "cell_tower", href: "/cpanel", exact: true, permission: "metrics.view" },
        { id: "admins", label: "Admin Management", icon: "admin_panel_settings", href: "/cpanel/admins", permission: "admins.view" },
      ]
    },
    {
      title: "User Management",
      items: [
        { id: "users", label: "Users & Permissions", icon: "group", href: "/cpanel/users", permission: "users.view" },
        { id: "virtual_accounts", label: "Virtual Accounts", icon: "account_balance_wallet", href: "/cpanel/virtual-accounts", permission: "users.view" },
        { id: "kyc", label: "KYC Approvals", icon: "verified_user", href: "/cpanel/kyc", badge: sidebarCounts["kyc"], permission: "kyc.view" },
        { id: "limit_requests", label: "Limit Requests", icon: "manage_accounts", href: "/cpanel/limit-requests", badge: sidebarCounts["limit_requests"], permission: "users.manage" },
        { id: "freeze", label: "Account Freeze", icon: "ac_unit", href: "/cpanel/freeze", permission: "freeze.manage" },
        { id: "delete_account", label: "Delete Account", icon: "delete_forever", href: "/cpanel/delete-account", badge: sidebarCounts["delete_account"], permission: "users.manage" },
        { id: "trn_issues", label: "TRN Issues", icon: "report_problem", href: "/cpanel/trn-issues", badge: sidebarCounts["trn_issues"], permission: "users.view" },
        { id: "tier_levels", label: "Assign Tier Levels", icon: "workspace_premium", href: "/cpanel/tier-levels", permission: "limits.manage" },
        { id: "set_limits", label: "Set Limits", icon: "tune", href: "/cpanel/set-limits", permission: "limits.manage" },
        { id: "limits", label: "Global Transfer Limits", icon: "trending_up", href: "/cpanel/limits", permission: "limits.manage" },
      ]
    },
    {
      title: "Branding & Customization",
      items: [
        { id: "push_notifications", label: "Push Notifications", icon: "notifications_active", href: "/cpanel/push-notifications", permission: "branding.manage" },
        { id: "emergency", label: "Emergency Broadcast", icon: "campaign", href: "/cpanel/emergency", permission: "branding.manage" },
        { id: "settings", label: "Global Settings", icon: "settings_suggest", href: "/cpanel/settings", permission: "branding.manage" },
        { id: "feature_toggles", label: "Service Feature Controls", icon: "toggle_on", href: "/cpanel/feature-toggles", permission: "feature_toggle.manage" },
        { id: "support_chat", label: "Support Chat", icon: "forum", href: "/cpanel/support-chat", permission: "users.view" },
        { id: "communication", label: "Communication & Branding", icon: "mark_email_unread", href: "/cpanel/communication", permission: "communication.branding.manage" },
        { id: "banners", label: "Slide Banners", icon: "photo_library", href: "/cpanel/banners", permission: "banners.manage" },
        { id: "bank_logos", label: "Bank Logos", icon: "account_balance", href: "/cpanel/bank-logos", permission: "bank_logos.manage" },
        { id: "bill_logos", label: "Bills Logos", icon: "receipt_long", href: "/cpanel/bill-logos", permission: "bill_logos.manage" },
        { id: "whatsapp", label: "WhatsApp Link", icon: "hub", href: "/cpanel/whatsapp", permission: "whatsapp.manage" },
        { id: "email_connect", label: "Email Connect", icon: "alternate_email", href: "/cpanel/email-connect", permission: "email_connect.manage" },
      ]
    },
    {
      title: "Financials & Markups",
      items: [
        { id: "deposit", label: "Deposit Fund", icon: "add_card", href: "/cpanel/deposit", permission: "wallets.manage" },
        { id: "trn_fee", label: "TRN Fee Config", icon: "price_change", href: "/cpanel/trn-fee", permission: "wallets.manage" },
        { id: "inflow_deductions", label: "Auto Inflow Fees", icon: "price_change", href: "/cpanel/inflow-deductions", permission: "wallets.manage" },
        { id: "held_deposits", label: "Blocked & Held", icon: "lock_clock", href: "/cpanel/held-deposits", badge: sidebarCounts["held_deposits"], permission: "wallets.manage" },
        { id: "deductions", label: "Global Wallet Deductions", icon: "payments", href: "/cpanel/deductions", permission: "wallet.deductions.manage" },
        { id: "profit", label: "Commission Markups", icon: "tune", href: "/cpanel/vtu-profit", permission: "vtu.manage" },
        { id: "exchange_rates", label: "Exchange Rates & Swaps", icon: "currency_exchange", href: "/cpanel/exchange-rates", permission: "exchange_rates.manage" },
        { id: "investments", label: "Fixed Deposits", icon: "savings", href: "/cpanel/investments", permission: "investments.manage" },
        { id: "history", label: "User Ledger Audits", icon: "history", href: "/cpanel/user-history", permission: "user_history.view" },
      ]
    }
  ];

  const storeNavItems: NavItem[] = [
    { id: "store_products", label: "Store Products", icon: "inventory_2", href: "/cpanel/store", exact: true, permission: "store.view" },
    { id: "store_orders", label: "Dispatch Orders", icon: "shopping_bag", href: "/cpanel/store/orders", badge: sidebarCounts["store_orders"], permission: "store.view" },
    { id: "store_reviews", label: "Customer Reviews", icon: "rate_review", href: "/cpanel/store/reviews", badge: sidebarCounts["store_reviews"], permission: "store.view" },
    { id: "store_stock", label: "Stock Income", icon: "trending_up", href: "/cpanel/store/stock", permission: "store.view" },
    { id: "store_categories", label: "Manage Categories", icon: "category", href: "/cpanel/store/categories", permission: "store.view" },
    { id: "store_slides", label: "Store Slides", icon: "view_carousel", href: "/cpanel/store/slides", permission: "store.view" },
    { id: "store_settings", label: "Store Settings", icon: "settings", href: "/cpanel/store/settings", permission: "store.view" },
  ];

  const estateNavItems: NavItem[] = [
    { id: "estate_properties", label: "Property Listings", icon: "home_work", href: "/cpanel/estate", exact: true, badge: sidebarCounts["estate_properties"], permission: "estate.view" },
    { id: "estate_slides", label: "Estate Slides & Banners", icon: "view_carousel", href: "/cpanel/estate/slides", permission: "estate.view" },
    { id: "estate_edits", label: "Property Edits & Audit", icon: "rate_review", href: "/cpanel/estate/edits", badge: sidebarCounts["estate_edits"], permission: "estate.view" },
    { id: "estate_sellers", label: "Sellers & Agents", icon: "badge", href: "/cpanel/estate/sellers", badge: sidebarCounts["estate_sellers"], permission: "estate.view" },
    { id: "estate_inquiries", label: "Customer Inquiries", icon: "contact_support", href: "/cpanel/estate/inquiries", badge: sidebarCounts["estate_inquiries"], permission: "estate.view" },
    { id: "estate_reports", label: "Flagged Reports", icon: "flag", href: "/cpanel/estate/reports", badge: sidebarCounts["estate_reports"], permission: "estate.view" },
    { id: "estate_settings", label: "Property Settings", icon: "settings", href: "/cpanel/estate/settings", permission: "estate.view" },
  ];

  const estateTotalBadge = (sidebarCounts["estate_properties"] || 0) + (sidebarCounts["estate_edits"] || 0) + (sidebarCounts["estate_sellers"] || 0) + (sidebarCounts["estate_inquiries"] || 0) + (sidebarCounts["estate_reports"] || 0);
  const storeTotalBadge = (sidebarCounts["store_orders"] || 0) + (sidebarCounts["store_reviews"] || 0);

  const checkItemPermission = (item: NavItem): boolean => {
    if (!item.permission) return true;
    if (!adminUser) return true;
    if (item.permission === "admins.view") {
      return hasAdminPermission(adminUser, "admins.view") || hasAdminPermission(adminUser, "admins.manage");
    }
    if (item.permission === "users.view") {
      return hasAdminPermission(adminUser, "users.view") || hasAdminPermission(adminUser, "users.manage");
    }
    if (item.permission === "kyc.view") {
      return hasAdminPermission(adminUser, "kyc.view") || hasAdminPermission(adminUser, "kyc.manage");
    }
    if (item.permission === "store.view") {
      return hasAdminPermission(adminUser, "store.view") || hasAdminPermission(adminUser, "store.manage");
    }
    return hasAdminPermission(adminUser, item.permission);
  };

  const filteredNavCategories = navCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => checkItemPermission(item)),
    }))
    .filter((cat) => cat.items.length > 0);

  const filteredStoreNavItems = storeNavItems.filter((item) => checkItemPermission(item));
  const filteredEstateNavItems = estateNavItems.filter((item) => checkItemPermission(item));

  const isNavActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  if (!isAdminUnlocked) {
    return (
      <main className="!mt-0 min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4 text-gray-800" style={{ marginTop: 0 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl p-8 border border-gray-200 flex flex-col items-center text-center space-y-6 shadow-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FC7A00]">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>admin_panel_settings</span>
          </div>

          <div>
            <h2 className="font-hanken font-black text-2xl tracking-tight text-gray-900 leading-tight">
              {isResetPasswordMode ? "Reset Admin Password" : "CPanel Administrator Login"}
            </h2>
            <p className="font-hanken text-xs text-gray-500 mt-1.5 font-semibold leading-relaxed">
              {isResetPasswordMode
                ? "Enter your administrator email address to receive a secure password recovery link."
                : "Welcome to the E-Tech Enterprise Control Panel. Authenticate using your Administrator credentials."}
            </p>
          </div>

          {isResetPasswordMode ? (
            <div className="w-full space-y-4 text-left">
              <div className="flex items-center justify-between gap-2 px-2 py-1 bg-gray-100 rounded-xl text-[10px] font-black uppercase tracking-wider">
                <span className={cn("px-2 py-1 rounded-lg transition-all", resetStep === 1 ? "bg-[#FC7A00] text-white" : "text-gray-400")}>1. Phone Verification</span>
                <span className={cn("px-2 py-1 rounded-lg transition-all", resetStep === 2 ? "bg-[#FC7A00] text-white" : "text-gray-400")}>2. OTP Check</span>
                <span className={cn("px-2 py-1 rounded-lg transition-all", resetStep === 3 ? "bg-emerald-600 text-white" : "text-gray-400")}>3. Reset Link</span>
              </div>

              {resetStep === 1 && (
                <form onSubmit={handleRequestResetOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Administrator Email</label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="e.g. abdulkadir123shaba@gmail.com"
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Registered Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      placeholder="e.g. +2348033123456 or 08033123456"
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isRequestingOtp}
                    className="w-full py-4 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isRequestingOtp ? <><ButtonSpinner /> Requesting Phone OTP...</> : "Verify Phone & Request OTP"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetPasswordMode(false);
                      setResetStep(1);
                    }}
                    className="w-full text-center text-xs font-bold text-gray-500 hover:text-black uppercase tracking-wider cursor-pointer"
                  >
                    ← Back to Login
                  </button>
                </form>
              )}

              {resetStep === 2 && (
                <form onSubmit={handleVerifyResetOtp} className="space-y-4">
                  <div className="p-3 bg-orange-50 border border-orange-100 rounded-2xl text-center space-y-1">
                    <p className="text-[11px] font-bold text-gray-700">OTP code dispatched via SMS/WhatsApp</p>
                    <p className="text-[10px] text-gray-500">Sent to: <span className="font-mono font-black">{maskPhoneForAdmin(resetPhone)}</span></p>
                    {otpDevCode && (
                      <p className="text-[10px] font-mono font-bold text-[#FC7A00] bg-white p-1 rounded border border-orange-200 mt-1 select-all">
                        DEV OTP: {otpDevCode}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00] block text-center">Enter 6-Digit OTP Code</label>

                    {/* 6 Individual Digit Inputs */}
                    <div className="flex items-center justify-between gap-1.5">
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            adminOtpInputsRef.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={resetOtpDigits[idx]}
                          disabled={isVerifyingOtp}
                          onChange={(e) => handleAdminOtpDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleAdminOtpKeyDown(idx, e)}
                          onPaste={handleAdminOtpPaste}
                          className={`w-10 h-12 bg-white border ${
                            resetOtpDigits[idx] ? "border-[#FC7A00] bg-orange-50/20" : "border-gray-300"
                          } rounded-xl text-center font-mono font-black text-lg text-gray-900 outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all shadow-xs disabled:opacity-50`}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp || resetOtp.length !== 6}
                    className="w-full py-4 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isVerifyingOtp ? <><ButtonSpinner /> Verifying OTP Code...</> : "Confirm OTP Code"}
                  </button>

                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <button
                      type="button"
                      onClick={() => setResetStep(1)}
                      className="hover:text-black uppercase tracking-wider cursor-pointer"
                    >
                      ← Re-enter Phone
                    </button>

                    {adminOtpCooldown > 0 ? (
                      <span className="text-[10px] text-gray-400 font-bold">Resend in {adminOtpCooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isRequestingOtp}
                        onClick={() => handleRequestResetOtp({ preventDefault: () => {} } as any)}
                        className="text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer disabled:opacity-50"
                      >
                        {isRequestingOtp ? "Sending..." : "Resend OTP"}
                      </button>
                    )}
                  </div>
                </form>
              )}

              {resetStep === 3 && (
                <div className="space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: '"FILL" 1' }}>mark_email_read</span>
                  </div>

                  <div>
                    <h3 className="font-black text-sm text-gray-900 uppercase">Phone Identity Verified</h3>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold leading-relaxed">
                      Click below to dispatch the official password reset recovery link to <span className="font-bold text-black">{adminEmail}</span>.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isDispatchingResetEmail}
                    onClick={handleDispatchResetEmail}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isDispatchingResetEmail ? <><ButtonSpinner /> Sending Password Reset Email...</> : "Dispatch Reset Link to Email"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetPasswordMode(false);
                      setResetStep(1);
                    }}
                    className="text-xs font-bold text-gray-500 hover:text-black uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleAdminVerify} className="w-full space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Administrator Email</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="e.g. abdulkadir123shaba@gmail.com"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <div className="flex justify-between items-center">
                  <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Administrator Password</label>
                  <button
                    type="button"
                    onClick={() => setIsResetPasswordMode(true)}
                    className="text-[10px] font-bold text-gray-400 hover:text-[#FC7A00] uppercase"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter Password"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-4 pr-11 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FC7A00] transition-colors p-1 flex items-center justify-center cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingPin}
                className="w-full py-4 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer disabled:opacity-50 shadow-md"
              >
                {isVerifyingPin ? <><ButtonSpinner /> Authenticating Credentials...</> : "Authenticate Administrator"}
              </button>
            </form>
          )}
        </motion.div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "h-screen overflow-hidden flex flex-col md:flex-row font-hanken !mt-0 relative transition-colors duration-300",
        isDark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-800"
      )}
      style={{ marginTop: 0 }}
    >
      {/* Mobile Header Bar */}
      <div className={cn(
        "md:hidden flex items-center justify-between px-5 py-4 w-full z-40 shrink-0 border-b transition-colors duration-300",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 p-1 flex items-center justify-center">
            <img src={config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png"} alt="E-Tech" className="object-contain w-full h-full" />
          </div>
          <span className={cn("font-hanken font-black text-sm tracking-tight", isDark ? "text-white" : "text-gray-900")}>E-TECH CP</span>
        </div>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={cn(
            "w-10 h-10 rounded-full border flex items-center justify-center active:scale-90 transition-all cursor-pointer",
            isDark ? "border-gray-700 text-gray-200" : "border-gray-200 text-gray-700"
          )}
        >
          <span className="material-symbols-outlined text-[24px]">
            {isMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {/* Single Mobile Backdrop Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* SINGLE UNIFIED CPANEL SIDEBAR NAVIGATION */}
      <motion.aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 md:z-auto md:static h-full border-r flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300",
          isMenuOpen ? "translate-x-0 w-[270px]" : "-translate-x-full md:translate-x-0",
          isSidebarMinimized ? "md:w-20" : "md:w-64",
          isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand Row */}
          <div className={cn("p-4 border-b flex items-center justify-between min-h-[73px] shrink-0", isDark ? "border-gray-800" : "border-gray-100")}>
            <div className={cn("flex items-center gap-2.5 min-w-0 flex-1", isSidebarMinimized && !isMenuOpen && "md:justify-center")}>
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 p-1 flex-shrink-0 flex items-center justify-center shadow-xs">
                <img src={config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png"} alt="E-Tech" className="object-contain w-full h-full" />
              </div>
              {(!isSidebarMinimized || isMenuOpen) && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col min-w-0"
                >
                  <h1 className={cn("font-hanken font-black text-sm tracking-tight truncate", isDark ? "text-white" : "text-gray-900")}>
                    E-TECH
                  </h1>
                  <p className="text-[8px] font-black tracking-widest text-[#FC7A00] uppercase mt-0.5">Control Panel</p>
                </motion.div>
              )}
            </div>

            {/* Desktop Minimize Toggle */}
            <button
              onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
              className={cn(
                "hidden md:flex w-7 h-7 rounded-lg border items-center justify-center cursor-pointer active:scale-90 transition-all ml-1 flex-shrink-0",
                isDark ? "border-gray-700 hover:bg-gray-800 text-gray-400" : "border-gray-200 hover:bg-gray-50 text-gray-500"
              )}
              title={isSidebarMinimized ? "Expand sidebar" : "Minimize sidebar"}
            >
              <span className="material-symbols-outlined text-[16px] font-bold">
                {isSidebarMinimized ? "chevron_right" : "chevron_left"}
              </span>
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                "md:hidden w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer active:scale-90 transition-all",
                isDark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Categorized Navigation Items */}
          <nav className="p-3 space-y-3 flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar">
            {isLoadingSession ? (
              /* Sidebar Slide Menu Skeleton Loader */
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map((section) => (
                  <div key={section} className="space-y-2">
                    {(!isSidebarMinimized || isMenuOpen) && (
                      <div className="h-2.5 w-20 bg-gray-200 dark:bg-gray-800 rounded-md mx-2 my-1" />
                    )}
                    {[1, 2].map((item) => (
                      <div
                        key={item}
                        className={cn(
                          "h-9 rounded-xl bg-gray-200 dark:bg-gray-800/80 flex items-center gap-3 px-3",
                          isSidebarMinimized && !isMenuOpen && "justify-center px-0"
                        )}
                      >
                        <div className="w-4 h-4 rounded-md bg-gray-300 dark:bg-gray-700 shrink-0" />
                        {(!isSidebarMinimized || isMenuOpen) && (
                          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded-md flex-1" />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {filteredNavCategories.map((cat, catIdx) => (
                  <div key={cat.title} className="space-y-1">
                    {(!isSidebarMinimized || isMenuOpen) ? (
                      <div className="px-2 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                        {cat.title}
                      </div>
                    ) : (
                      catIdx > 0 && <div className="border-t border-gray-200/40 dark:border-gray-800 my-1" />
                    )}

                    {cat.items.map((item) => {
                      const active = isNavActive(item);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          title={isSidebarMinimized && !isMenuOpen ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap w-full justify-between",
                            isSidebarMinimized && !isMenuOpen && "justify-center px-0 py-2.5",
                            active
                              ? "bg-orange-500/10 text-[#FC7A00] border border-orange-500/20"
                              : isDark ? "text-gray-400 hover:bg-gray-800 hover:text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-[18px] flex-shrink-0">{item.icon}</span>
                            {(!isSidebarMinimized || isMenuOpen) && <span className="flex-1 text-left truncate">{item.label}</span>}
                          </div>
                          {item.badge && item.badge > 0 ? (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-500 text-white animate-pulse">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ))}

                {/* Estate Marketplace Accordion / Submenu */}
                {filteredEstateNavItems.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/40 dark:border-gray-800">
                    <button
                      onClick={() => {
                        if (isSidebarMinimized && !isMenuOpen) {
                          setIsSidebarMinimized(false);
                          setIsEstateExpanded(true);
                        } else {
                          setIsEstateExpanded(!isEstateExpanded);
                        }
                      }}
                      title={isSidebarMinimized && !isMenuOpen ? "Estate Marketplace" : undefined}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap w-full",
                        isSidebarMinimized && !isMenuOpen && "justify-center px-0 py-2.5",
                        pathname.startsWith("/cpanel/estate")
                          ? "bg-orange-500/10 text-[#FC7A00]"
                          : isDark ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px] flex-shrink-0">domain</span>
                        {(!isSidebarMinimized || isMenuOpen) && <span>Estate Marketplace</span>}
                      </div>
                      {(!isSidebarMinimized || isMenuOpen) && (
                        <div className="flex items-center gap-1.5">
                          {estateTotalBadge > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-500 text-white animate-pulse">
                              {estateTotalBadge}
                            </span>
                          )}
                          <span className="material-symbols-outlined text-[16px]">
                            {isEstateExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </div>
                      )}
                    </button>

                    {isEstateExpanded && (!isSidebarMinimized || isMenuOpen) && (
                      <div className="pl-6 pt-1 space-y-1">
                        {filteredEstateNavItems.map((sub) => {
                          const active = isNavActive(sub);
                          return (
                            <Link
                              key={sub.id}
                              href={sub.href}
                              onClick={() => setIsMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap w-full justify-between",
                                active
                                  ? "text-[#FC7A00] bg-orange-500/10 font-black"
                                  : isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-[15px] flex-shrink-0">{sub.icon}</span>
                                <span className="flex-1 text-left truncate">{sub.label}</span>
                              </div>
                              {sub.badge && sub.badge > 0 ? (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-500 text-white animate-pulse">
                                  {sub.badge}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Storefront Manager Accordion / Submenu */}
                {filteredStoreNavItems.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/40 dark:border-gray-800">
                    <button
                      onClick={() => {
                        if (isSidebarMinimized && !isMenuOpen) {
                          setIsSidebarMinimized(false);
                          setIsStoreExpanded(true);
                        } else {
                          setIsStoreExpanded(!isStoreExpanded);
                        }
                      }}
                      title={isSidebarMinimized && !isMenuOpen ? "Storefront Manager" : undefined}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap w-full",
                        isSidebarMinimized && !isMenuOpen && "justify-center px-0 py-2.5",
                        pathname.startsWith("/cpanel/store")
                          ? "bg-orange-500/10 text-[#FC7A00]"
                          : isDark ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-[18px] flex-shrink-0">storefront</span>
                        {(!isSidebarMinimized || isMenuOpen) && <span>Storefront Manager</span>}
                      </div>
                      {(!isSidebarMinimized || isMenuOpen) && (
                        <div className="flex items-center gap-1.5">
                          {storeTotalBadge > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-500 text-white animate-pulse">
                              {storeTotalBadge}
                            </span>
                          )}
                          <span className="material-symbols-outlined text-[16px]">
                            {isStoreExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </div>
                      )}
                    </button>

                    {isStoreExpanded && (!isSidebarMinimized || isMenuOpen) && (
                      <div className="pl-6 pt-1 space-y-1">
                        {filteredStoreNavItems.map((sub) => {
                          const active = isNavActive(sub);
                          return (
                            <Link
                              key={sub.id}
                              href={sub.href}
                              onClick={() => setIsMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap w-full justify-between",
                                active
                                  ? "text-[#FC7A00] bg-orange-500/10 font-black"
                                  : isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-[15px] flex-shrink-0">{sub.icon}</span>
                                <span className="flex-1 text-left truncate">{sub.label}</span>
                              </div>
                              {sub.badge && sub.badge > 0 ? (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-500 text-white animate-pulse">
                                  {sub.badge}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Logout / Lock Console Footer Button */}
        <div className={cn("p-4 border-t shrink-0", isDark ? "border-gray-800" : "border-gray-100")}>
          <button
            onClick={() => setShowLockConfirm(true)}
            title={isSidebarMinimized && !isMenuOpen ? "Sign Out / Logout" : undefined}
            className={cn(
              "w-full py-3 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
              isSidebarMinimized && !isMenuOpen && "px-0 py-2.5",
              isDark
                ? "bg-red-950/30 hover:bg-red-900/50 text-red-400 border-red-900/50"
                : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
            )}
          >
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">logout</span>
            {(!isSidebarMinimized || isMenuOpen) && <span>Sign Out / Logout</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content Viewport */}
      <section className="flex-1 flex flex-col min-w-0 h-full md:h-screen overflow-hidden relative">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {children}
        </div>
      </section>

      {/* Lock Console Modal */}
      <AnimatePresence>
        {showLockConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLockConfirm(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[99999]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 max-w-sm md:w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[32px] p-6 text-center shadow-2xl z-[100000] font-hanken"
            >
              <div className="w-14 h-14 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: '"FILL" 1' }}>logout</span>
              </div>

              <h4 className="font-extrabold text-base text-gray-900 dark:text-white leading-tight">
                Confirm Admin Logout
              </h4>
              <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-2 font-medium leading-relaxed">
                Are you sure you want to sign out of the Control Panel? Your active administrative session cookie and session tokens will be cleared immediately.
              </p>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowLockConfirm(false)}
                  className="py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowLockConfirm(false);
                    try {
                      await fetch("/api/admin/auth/logout", { method: "POST" });
                    } catch (err) {
                      console.error("Logout API call failed:", err);
                    }
                    setIsAdminUnlocked(false);
                    if (typeof window !== "undefined") {
                      sessionStorage.removeItem("admin_session_unlocked");
                    }
                    toast.success("Logged out successfully from Control Panel.");
                    if (typeof window !== "undefined") {
                      window.location.href = "/cpanel";
                    }
                  }}
                  className="py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:brightness-105 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">logout</span>
                  Yes, Log Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function CpanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <CpanelThemeProvider>
      <CpanelLayoutContent>{children}</CpanelLayoutContent>
    </CpanelThemeProvider>
  );
}