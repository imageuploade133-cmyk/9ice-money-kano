"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NotificationTray, Notification } from "./NotificationTray";
import { LogoutDrawer } from "./LogoutDrawer";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";
import { useAppConfig } from "@/lib/ConfigContext";
import { useRouter } from "next/navigation";
import { handleAppSignOut } from "@/lib/logout-util";
import { AppLogo } from "@/components/AppLogo";
import { useAuth } from "@/lib/AuthContext";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, limit } from "firebase/firestore";
import { useEffect } from "react";
import { triggerHaptic } from "@/lib/haptics";

interface HeaderProps {
  userName: string;
  profileImage: string;
  isLoading?: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    title: "Transfer Successful",
    message: "Transfer of ₦25,000.00 to Opay account STEVE was completed successfully. Tap to view transaction receipt.",
    time: "2m ago",
    type: "transaction",
    read: false,
  },
  {
    id: "2",
    title: "Security Alert",
    message: "A secure new login session was authenticated on an iPhone 15 Pro from Lagos, Nigeria. Tap to inspect security log.",
    time: "1h ago",
    type: "security",
    read: false,
  },
  {
    id: "3",
    title: "Premium Promo Reward",
    message: "Welcome to E-Tech Infinite! Your elite status grants you 15% off at luxury ZUMA lounges. Tap to view invitation card.",
    time: "5h ago",
    type: "promo",
    read: true,
  },
];

const isCustomAvatar = (url?: string) => {
  if (!url) return false;
  if (url.includes("aida-public") || url.includes("googleusercontent.com/aida-public")) return false;
  return url.includes("i.ibb.co") || url.includes("ibb.co") || url.includes("images.unsplash.com");
};

function formatNotificationTime(createdAtStr?: string): string {
  if (!createdAtStr) return "Just now";
  try {
    const date = new Date(createdAtStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs) || diffMs < 0) return "Just now";

    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  } catch {
    return "Just now";
  }
}

export const Header: React.FC<HeaderProps> = ({ userName, profileImage, isLoading }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const { config } = useAppConfig();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [imgError, setImgError] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // Paginated listener variables to optimize database read performance
  const [limitCount, setLimitCount] = useState(10);
  const [hasMore, setHasMore] = useState(true);

  // When the notifications tray is closed, reset limitCount back to 10
  // to save Firestore read costs while idling on the home screen.
  useEffect(() => {
    if (!isNotificationsOpen) {
      setLimitCount(10);
    }
  }, [isNotificationsOpen]);

  // Load and listen to notifications in real-time from Firestore subcollection
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("mock") === "true") {
      setNotifications(INITIAL_NOTIFICATIONS);
      setHasMore(false);
      return;
    }

    if (!user) {
      setNotifications([]);
      setHasMore(false);
      return;
    }

    // Query 1 extra item to check if there are more remaining items for pagination
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(limitCount + 1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Notification[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            title: data.title || "Notification",
            message: data.body || data.message || "",
            time: formatNotificationTime(data.createdAt),
            type: (data.type || "transaction") as "transaction" | "security" | "promo",
            read: !!data.read,
            amount: typeof data.amount === "number" ? data.amount : undefined,
            currency: data.currency || "NGN",
            reference: data.reference || "",
            recipientName: data.recipientName || "",
            bankName: data.bankName || "",
            channel: data.channel || "",
          });
        });

        if (list.length > limitCount) {
          setHasMore(true);
          setNotifications(list.slice(0, limitCount));
        } else {
          setHasMore(false);
          setNotifications(list);
        }
      },
      (error) => {
        console.error("[Header Notifications Listener Exception]:", error.message);
      }
    );

    return () => unsubscribe();
  }, [user, limitCount]);

  const handleLoadMore = () => {
    if (hasMore) {
      setLimitCount((prev) => prev + 10);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasCustomPhoto = isCustomAvatar(profileImage) && !imgError;

  const handleSignOut = async () => {
    setIsLogoutOpen(false);
    await handleAppSignOut(router);
  };

  // Fast action navigation to Profile Page
  const handleOpenProfile = () => {
    router.push("/profile");
  };

  // Production-grade action handlers with live Firestore synchronization
  const handleMarkAllRead = async () => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock) {
      setNotifications([]);
      toast.success("Notifications cleared");
      return;
    }

    if (!user) return;

    try {
      const unreadNotifications = notifications.filter((n) => !n.read);
      if (unreadNotifications.length === 0) return;

      const batch = writeBatch(db);
      unreadNotifications.forEach((n) => {
        const ref = doc(db, "users", user.uid, "notifications", n.id);
        batch.update(ref, { read: true });
      });

      await batch.commit();
      toast.success("All notifications marked as read");
    } catch (err: any) {
      console.error("[Header] Mark all read failed:", err.message);
      toast.error("Failed to mark notifications as read.");
    }
  };

  const handleDeleteNotification = async (id: string) => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Alert cleared");
      return;
    }

    if (!user) return;

    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
      toast.success("Alert cleared");
    } catch (err: any) {
      console.error("[Header] Delete notification failed:", err.message);
      toast.error("Failed to delete notification.");
    }
  };

  const handleToggleRead = async (id: string) => {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (isMock) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return;
    }

    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid, "notifications", id), {
        read: true,
      });
    } catch (err: any) {
      console.error("[Header] Update read status failed:", err.message);
    }
  };

  return (
    <>
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-margin-mobile py-2.5 min-[375px]:py-3 bg-surface-dim/80 backdrop-blur-xl shadow-sm text-black">
        <div className="flex items-center gap-1.5 min-[375px]:gap-2.5 flex-1 min-w-0 mr-2">
          {isLoading ? (
            <div className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full skeleton-shimmer flex-shrink-0" />
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerHaptic();
                handleOpenProfile();
              }}
              className="focus:outline-none flex-shrink-0 cursor-pointer"
              title="View Profile Settings"
            >
              {hasCustomPhoto ? (
                <div className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-primary/30 overflow-hidden scale-95 active:scale-90 transition-transform relative flex-shrink-0">
                  <Image
                    className="object-cover"
                    alt="Profile"
                    src={profileImage}
                    fill
                    sizes="36px"
                    priority
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <div className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full bg-gradient-to-tr from-[#FC7A00] to-[#FF9022] flex items-center justify-center text-white scale-95 active:scale-90 transition-transform relative flex-shrink-0 shadow-sm">
                  <span className="material-symbols-outlined text-[18px] min-[375px]:text-[20px] font-bold">person</span>
                </div>
              )}
            </button>
          )}
          <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center animate-fade-in">
            <AppLogo logoUrl={config.logoUrl} size={28} />
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={handleOpenProfile}>
            <p className="font-label-sm text-[8px] min-[375px]:text-[9px] text-on-surface-variant uppercase tracking-tighter font-bold leading-none truncate">
              Welcome back
            </p>
            {isLoading ? (
              <div className="h-4 bg-gray-200 rounded skeleton-shimmer w-20 mt-1" />
            ) : (
              <h1 className="font-hanken text-[14px] min-[375px]:text-[16px] tracking-tight text-black font-bold truncate" title={userName}>
                {userName}
              </h1>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/support"
            onClick={() => triggerHaptic()}
            className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Customer Support"
          >
            <span className="material-symbols-outlined text-[20px] min-[375px]:text-[22px]" style={{ fontVariationSettings: '"wght" 500' }}>
              support_agent
            </span>
          </Link>
          <button
            onClick={() => {
              triggerHaptic();
              setIsLogoutOpen(true);
            }}
            className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Sign Out"
          >
            <span className="material-symbols-outlined text-[18px] min-[375px]:text-[20px]" style={{ fontVariationSettings: '"wght" 500' }}>
              power_settings_new
            </span>
          </button>
          <button
            onClick={() => {
              triggerHaptic();
              setIsNotificationsOpen(true);
            }}
            className="relative w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[20px] min-[375px]:text-[22px]">notifications</span>
            {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-error text-error-container rounded-full text-[8px] font-bold flex items-center justify-center border border-surface-dim">
                    {unreadCount}
                </span>
            )}
          </button>
        </div>
      </header>

      <NotificationTray
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllRead}
        onDeleteNotification={handleDeleteNotification}
        onToggleRead={handleToggleRead}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
      />

      <LogoutDrawer
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
};
