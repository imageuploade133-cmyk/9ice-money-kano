"use client";

import { useEffect, useState, useCallback } from "react";
import { getClientMessaging } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Use public VAPID key from environment exclusively (no hardcoded fallback)
const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || "";

export function useFcm() {
  const { user, userData, deviceAuthState } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const router = useRouter();

  const syncTokenWithBackend = useCallback(async (token: string, action: "register" | "unregister") => {
    if (!user) return;

    // FCM registration is bound to the server-authoritative active device
    // session. During a new-device OTP flow there is intentionally no active
    // session yet, so wait until AuthContext reports verification complete.
    if (deviceAuthState !== "AUTHENTICATED_VERIFIED") {
      console.log("[FCM Sync] Waiting for verified device session before registering token.");
      return;
    }

    const maxAttempts = action === "register" ? 7 : 1;
    const retryDelays = [500, 1000, 2000, 3000, 5000, 7000];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const idToken = await user.getIdToken();
        const sessionId =
          typeof window !== "undefined"
            ? localStorage.getItem("active_session_id")
            : null;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        };

        if (sessionId) {
          headers["X-Session-ID"] = sessionId;
        }

        const res = await fetch("/api/fcm/register", {
          method: action === "register" ? "POST" : "DELETE",
          headers,
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          console.log(`[FCM Sync] Token ${action}ed successfully in database.`);
          return;
        }

        // Only retry the transient session-establishment race. Never retry a
        // revoked/mismatched session, which must remain fail-closed.
        const errorText = String(data?.error || data?.message || "").toLowerCase();
        const retryableSessionRace =
          res.status === 401 &&
          (
            errorText.includes("missing session id") ||
            errorText.includes("active session missing") ||
            errorText.includes("failed to resolve active session") ||
            errorText.includes("session validation error")
          );

        if (!retryableSessionRace || attempt >= maxAttempts - 1) {
          console.warn("[FCM Sync Warning] Token registration failed:", data?.message || data?.error);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt] ?? 5000));
      } catch (err: any) {
        if (attempt >= maxAttempts - 1) {
          console.error("[FCM Sync Exception] Failed to sync token with backend:", err.message);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt] ?? 5000));
      }
    }
  }, [user, deviceAuthState]);

  const requestPermissionAndGetToken = useCallback(async () => {
    if (typeof window === "undefined") return null;

    // Check if running inside Flutter InAppWebView first
    if ((window as any).flutter_inappwebview) {
      console.log("[FCM Hook] Flutter InAppWebView detected. Fetching token via JS Bridge...");
      try {
        const token = await (window as any).flutter_inappwebview.callHandler("getFcmToken");
        if (token) {
          setFcmToken(token);
          sessionStorage.setItem("active_fcm_token", token);
          console.log("[FCM Hook] Retrieved Flutter FCM token via JS Bridge successfully:", token);
          await syncTokenWithBackend(token, "register");
          return token;
        } else {
          console.warn("[FCM Hook Warning] Flutter getFcmToken handler returned empty token.");
        }
      } catch (err: any) {
        console.error("[FCM Hook Error] Failed to retrieve token via Flutter JS Bridge:", err.message);
      }
    }

    if (!("Notification" in window)) {
      console.warn("[FCM Hook] Browser does not support push notifications.");
      return null;
    }

    try {
      const messaging = await getClientMessaging();
      if (!messaging) {
        console.warn("[FCM Hook] Firebase Messaging is not supported in this browser environment.");
        return null;
      }

      // Request browser permission
      const status = await Notification.requestPermission();
      setPermission(status);

      if (status !== "granted") {
        console.log("[FCM Hook] Notification permission denied or dismissed.");
        return null;
      }

      // Ensure VAPID key is loaded
      if (!VAPID_KEY) {
        console.log("[FCM Hook] VAPID key is not set. Skipping Web Push notification subscription.");
        return null;
      }

      // Fetch FCM Token from Firebase messaging server using the public VAPID key
      const { getToken } = await import("firebase/messaging");
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (token) {
        setFcmToken(token);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("active_fcm_token", token);
        }
        console.log("[FCM Hook] Generated secure FCM token successfully:", token);
        await syncTokenWithBackend(token, "register");
        return token;
      } else {
        console.warn("[FCM Hook] No FCM registration token available. Verify your VAPID key.");
      }
    } catch (err: any) {
      console.error("[FCM Hook Error] Failed to request permission or fetch token:", err.message);
    }
    return null;
  }, [syncTokenWithBackend]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Expose global token syncing function for native callbacks (automatic token changes)
      (window as any).__syncFcmToken = async (newToken: string) => {
        console.log("[FCM Bridge] Sync request received from Flutter container:", newToken);
        setFcmToken(newToken);
        sessionStorage.setItem("active_fcm_token", newToken);
        if (user) {
          await syncTokenWithBackend(newToken, "register");
        }
      };
    }

    if (!user) {
      setFcmToken(null);
      return;
    }

    // Request and sync FCM token on user login
    requestPermissionAndGetToken();

    // Listen to foreground notifications
    let unsubscribeForeground: (() => void) | undefined;

    const setupForegroundListener = async () => {
      const messaging = await getClientMessaging();
      if (!messaging) return;

      const { onMessage } = await import("firebase/messaging");
      unsubscribeForeground = onMessage(messaging, (payload) => {
        console.log("[FCM Foreground] Push notification received in foreground:", payload);

        const title = payload.notification?.title || payload.data?.title || "New Wallet Update";
        const body = payload.notification?.body || payload.data?.body || "You have a new transaction alert.";
        const targetUrl = payload.data?.url || payload.data?.click_action || "";

        const txRef = payload.data?.reference || payload.data?.transactionReference || payload.data?.txRef;

        // Display a high-fidelity, customized Sonner toast with a progress activity indicator
        toast.info(title, {
          description: body,
          duration: 6000,
          action: txRef ? {
            label: "View Receipt",
            onClick: () => {
              if (typeof window !== "undefined" && (window as any).__openNotificationTransaction) {
                (window as any).__openNotificationTransaction(txRef);
              } else {
                router.push(`/?txRef=${encodeURIComponent(txRef)}`);
              }
            },
          } : targetUrl ? {
            label: "View",
            onClick: () => router.push(targetUrl),
          } : undefined,
          icon: (
            <span className="material-symbols-outlined text-[#FC7A00] text-[20px] font-bold animate-bounce">
              notifications_active
            </span>
          ),
        });
      });
    };

    setupForegroundListener();

    return () => {
      if (unsubscribeForeground) {
        unsubscribeForeground();
      }
    };
  }, [user, deviceAuthState, requestPermissionAndGetToken]);

  return {
    fcmToken,
    permission,
    requestPermission: requestPermissionAndGetToken,
  };
}
