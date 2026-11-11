import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";

/**
 * Reusable, robust unified sign-out helper that handles:
 * 1. Unregistering the browser FCM token from the database.
 * 2. Logging out of Firebase Authentication.
 * 3. Clearing relevant mock and token values from storage.
 * 4. Navigating back to the login screen.
 */
export async function handleAppSignOut(router: any) {
  try {
    const isMock = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";

    if (isMock) {
      console.log("[SignOut] Mock sign-out initiated.");
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        sessionStorage.removeItem("active_fcm_token");
        toast.success("Logged out successfully");
        window.location.href = "/auth/login";
      } else {
        router.push("/auth/login");
      }
      return;
    }

    const user = auth.currentUser;
    const tokensToUnregister: string[] = [];

    const browserToken = typeof window !== "undefined" ? sessionStorage.getItem("active_fcm_token") : null;
    if (browserToken) {
      tokensToUnregister.push(browserToken);
    }

    if (typeof window !== "undefined" && (window as any).flutter_inappwebview) {
      try {
        const flutterToken = await (window as any).flutter_inappwebview.callHandler("getFcmToken");
        if (flutterToken && !tokensToUnregister.includes(flutterToken)) {
          tokensToUnregister.push(flutterToken);
        }
        // Directly invoke native Flutter handler to unregister token on mobile device
        await (window as any).flutter_inappwebview.callHandler("unregisterFcmToken").catch((err: any) => {
          console.warn("[SignOut Warning] Native unregisterFcmToken call failed:", err?.message || err);
        });
      } catch (err: any) {
        console.warn("[SignOut Warning] Failed to get Flutter token or invoke native unregister handler:", err.message);
      }
    }

    if (user && tokensToUnregister.length > 0) {
      try {
        const idToken = await user.getIdToken();
        for (const tokenToDel of tokensToUnregister) {
          const res = await fetch("/api/fcm/unregister", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ token: tokenToDel }),
          });

          if (res.ok) {
            console.log(`[SignOut] FCM token ${tokenToDel.slice(0, 10)}... unregistered successfully.`);
          } else {
            const data = await res.json().catch(() => ({}));
            console.warn("[SignOut Warning] FCM token unregistration failed:", data.error || data.message);
          }
        }
      } catch (err: any) {
        console.error("[SignOut Exception] Failed to unregister FCM token:", err.message);
      }
    }
  } catch (err: any) {
    console.error("[SignOut Exception] General error in pre-signout helper:", err.message);
  } finally {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("active_fcm_token");
      }
      await signOut(auth);
      toast.success("Logged out successfully");
    } catch (err: any) {
      console.error("[SignOut Error] Firebase auth signout crashed:", err.message);
      toast.error("Failed to sign out completely from auth session.");
    }
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    } else {
      router.push("/auth/login");
    }
  }
}
