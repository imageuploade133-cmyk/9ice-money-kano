"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, updateProfile } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import "@/lib/init-fetch-interceptor";
import { handleAppSignOut } from "@/lib/logout-util";
import { toast } from "sonner";
import { SessionRevokedModal, SessionRevokedData } from "@/components/layout/SessionRevokedModal";
import { NewDeviceOtpModal } from "@/components/layout/NewDeviceOtpModal";
import { NewDeviceSuccessModal } from "@/components/layout/NewDeviceSuccessModal";
import { getDetailedDeviceName } from "@/lib/device-util";


interface UserData {
  name?: string;
  email?: string;
  pin?: string;
  balance?: number;
  bonusBalance?: number;
  outstandingDebt?: number;
  isPinRequired?: boolean;
  isFaceIdEnabled?: boolean;
  isBiometricLoginEnabled?: boolean;
  isBiometricTransferEnabled?: boolean;
  dailyLimit?: number;
  singleLimit?: number;
  depositLimitExceeded?: boolean;
  unlimitedDeposits?: boolean;
  dailyDepositLimit?: number;
  todayDepositTotal?: number;
  tier?: string;
  photoURL?: string;
  phoneNumber?: string;
  phone?: string;
  bvn?: string;
  nin?: string;
  kycStatus?: string;
  isFrozen?: boolean;
  status?: string;
  freezeMessage?: string;
  virtualAccountActive?: boolean;
  virtualAccountNumber?: string;
  virtualAccountBankName?: string;
  accountNumber?: string;
  accountId?: string | number;
  is2faOtpEnabled?: boolean;
  [key: string]: unknown;
}

export type DeviceAuthState = "AUTHENTICATED_VERIFIED" | "AUTHENTICATED_PENDING_DEVICE_VERIFICATION" | "CHECKING_DEVICE_SESSION" | "UNAUTHENTICATED";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isPinVerified: boolean;
  setPinVerified: (verified: boolean) => void;
  userData: UserData | null;
  updateUserData: (updates: Partial<UserData>) => Promise<void>;
  deviceAuthState: DeviceAuthState;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const inFlightEstablishRef = React.useRef<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRevokedModalOpen, setIsRevokedModalOpen] = useState(false);
  const [revokedSessionData, setRevokedSessionData] = useState<SessionRevokedData | null>(null);

  // New Device OTP Challenge & Activation Success State
  const [deviceAuthState, setDeviceAuthState] = useState<DeviceAuthState>("UNAUTHENTICATED");
  const [isNewDeviceOtpOpen, setIsNewDeviceOtpOpen] = useState(false);
  const [isNewDeviceSuccessOpen, setIsNewDeviceSuccessOpen] = useState(false);
  const [previousDeviceName, setPreviousDeviceName] = useState<string>("");
  const [newDeviceChallenge, setNewDeviceChallenge] = useState<{
    challengeId: string;
    channel: "whatsapp" | "email";
    maskedDestination: string;
    channels: Array<{ type: "whatsapp" | "email"; label: string; masked: string }>;
  } | null>(null);

  // Load custom mock data from sessionStorage if present
  const getStoredMockData = (): UserData => {
    if (typeof window === "undefined") return {};
    const stored = sessionStorage.getItem("mock_user_data");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {};
      }
    }
    return {};
  };

  const saveStoredMockData = (data: UserData) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("mock_user_data", JSON.stringify(data));
    }
  };

  useEffect(() => {
    // Mock mode is strictly restricted to development/testing environments to prevent production authentication bypass
    const isDevEnv = process.env.NODE_ENV !== "production";
    const hasMockQuery = isDevEnv && typeof window !== "undefined" && window.location.search.includes("mock=true");
    const hasMockSession = isDevEnv && typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";

    if (hasMockQuery) {
      sessionStorage.setItem("mock", "true");
    }

    if (isDevEnv && (hasMockQuery || hasMockSession)) {
      setUser({
        uid: "mock-uid",
        displayName: "JULES VERNE",
        email: "jules@example.com",
      } as User);

      const storedMock = getStoredMockData();
      setUserData({
        name: "JULES VERNE",
        email: "jules@example.com",
        pin: "1234",
        balance: 750000,
        isPinRequired: true,
        isFaceIdEnabled: false,
        isBiometricLoginEnabled: true,
        isBiometricTransferEnabled: true,
        ...storedMock
      });
      setIsPinVerified(window.location.pathname !== "/auth/pin");
      setLoading(false);
      return;
    }

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (typeof window !== "undefined") {
        (window as any).__getFirebaseAuthToken = currentUser ? () => currentUser.getIdToken() : null;
      }

      if (currentUser) {
        setDeviceAuthState("CHECKING_DEVICE_SESSION");

        // Read existing local active_session_id to present on reloads/reopens
        const existingSessionId = typeof window !== "undefined" ? localStorage.getItem("active_session_id") : null;

        // 1. Establish or re-verify active session with backend API
        (async () => {
          if (inFlightEstablishRef.current) return;
          inFlightEstablishRef.current = true;
          try {
            const idToken = await currentUser.getIdToken();
            const res = await fetch("/api/auth/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`,
                ...(existingSessionId ? { "X-Session-ID": existingSessionId } : {}),
              },
              body: JSON.stringify({
                action: "establish",
                existingSessionId: existingSessionId || undefined,
                deviceName: getDetailedDeviceName(),
              }),
            });
            const sessData = await res.json().catch(() => ({}));

            if (res.ok && sessData.requiresOtp && sessData.challengeId) {
              // Server detected an existing active session on another device -> Transition into AUTHENTICATED_PENDING_DEVICE_VERIFICATION
              setDeviceAuthState("AUTHENTICATED_PENDING_DEVICE_VERIFICATION");
              setIsPinVerified(false);
              if (typeof window !== "undefined") {
                localStorage.removeItem("active_session_id");
              }
              setNewDeviceChallenge({
                challengeId: sessData.challengeId,
                channel: sessData.channel || "whatsapp",
                maskedDestination: sessData.maskedDestination || "",
                channels: sessData.channels || [],
              });
              setIsNewDeviceOtpOpen(true);

              if (sessData.dispatchWarning) {
                toast.warning(sessData.dispatchWarning);
              }
            } else if (res.ok && sessData.sessionId) {
              setDeviceAuthState("AUTHENTICATED_VERIFIED");
              if (typeof window !== "undefined") {
                localStorage.setItem("active_session_id", sessData.sessionId);
              }
            } else {
              // Fail closed: if session establishment returns error or unexpected payload, sign out immediately
              toast.error(sessData.error || "Session verification failed.");
              setDeviceAuthState("UNAUTHENTICATED");
              handleAppSignOut(null);
            }
          } catch (sessErr: any) {
            console.error("[AuthContext Session Setup Error]:", sessErr.message);
            // FAIL CLOSED: Immediately reject access on any network/server exception
            toast.error("Session establishment error. Signing out for security.");
            setDeviceAuthState("UNAUTHENTICATED");
            handleAppSignOut(null);
          } finally {
            inFlightEstablishRef.current = false;
          }
        })();

        // 2. Set up real-time listener for user data & active session revocation
        unsubscribeSnapshot = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;

            // Banned Account Guard Check
            if (data.isBanned === true || data.status === "BANNED" || data.status === "banned") {
              console.warn("[Banned Account] User account is banned. Executing signout...");
              if (typeof window !== "undefined") {
                localStorage.removeItem("active_session_id");
                localStorage.removeItem("active_fcm_token");
                sessionStorage.removeItem("active_fcm_token");
              }
              handleAppSignOut(null);
              return;
            }

            // Single Active Device / Session Revocation Check
            const localSessionId = typeof window !== "undefined" ? localStorage.getItem("active_session_id") : null;
            const remoteActiveSessionId = data.activeSessionId as string | undefined;

            if (localSessionId && remoteActiveSessionId && localSessionId !== remoteActiveSessionId) {
              console.warn("[Session Revoked] Remote active session changed. Quietly executing security logout for old device...");

              // 1. Immediately clear local session ID and FCM token so no subsequent API request can use it
              if (typeof window !== "undefined") {
                localStorage.removeItem("active_session_id");
                localStorage.removeItem("active_fcm_token");
                sessionStorage.removeItem("active_fcm_token");
              }

              // 2. Execute quiet security logout from Firebase Auth without showing modal on Device A
              handleAppSignOut(null);
              return;
            }

            setUserData({
              isPinRequired: true,
              isFaceIdEnabled: false,
              isBiometricLoginEnabled: data.isBiometricLoginEnabled ?? false,
              isBiometricTransferEnabled: data.isBiometricTransferEnabled ?? false,
              balance: data.balance !== undefined ? data.balance : 0.00,
              name: (data.displayName as string | undefined) || data.name || "",
              ...data
            });
          } else {
            setUserData({
              isPinRequired: true,
              isFaceIdEnabled: false,
              isBiometricLoginEnabled: false,
              isBiometricTransferEnabled: false,
              balance: 0.00,
            });
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore Listener Error:", error);
          setLoading(false);
        });
      } else {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        setUserData(null);
        setIsPinVerified(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const updateUserData = async (updates: Partial<UserData>) => {
    const isMock = sessionStorage.getItem("mock") === "true";

    if (isMock) {
      const merged = { ...userData, ...updates };
      setUserData(merged);
      saveStoredMockData(merged);

      if (user && updates.name) {
        setUser({ ...user, displayName: updates.name } as User);
      }
      return;
    }

    if (user) {
      // 1. Update Firebase Auth Profile if name or profile image changes
      if (updates.name || updates.photoURL) {
        await updateProfile(user, {
          displayName: updates.name || user.displayName,
          photoURL: (updates.photoURL as string) || user.photoURL
        });
      }

      // 2. Update Firestore
      await updateDoc(doc(db, "users", user.uid), updates);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isPinVerified,
        setPinVerified: setIsPinVerified,
        userData,
        updateUserData,
        deviceAuthState,
      }}
    >
      {children}
      <SessionRevokedModal
        isOpen={isRevokedModalOpen}
        sessionData={revokedSessionData}
        onClose={() => setIsRevokedModalOpen(false)}
      />

      {newDeviceChallenge && (
        <NewDeviceOtpModal
          isOpen={isNewDeviceOtpOpen}
          challengeId={newDeviceChallenge.challengeId}
          initialChannel={newDeviceChallenge.channel}
          maskedDestination={newDeviceChallenge.maskedDestination}
          channels={newDeviceChallenge.channels}
          onVerifiedSuccess={(newSessId, prevDev) => {
            if (typeof window !== "undefined") {
              localStorage.setItem("active_session_id", newSessId);
            }
            setIsNewDeviceOtpOpen(false);
            setNewDeviceChallenge(null);
            if (prevDev) {
              setPreviousDeviceName(prevDev);
            }
            setIsNewDeviceSuccessOpen(true);
          }}
          onCancel={() => {
            setIsNewDeviceOtpOpen(false);
            setNewDeviceChallenge(null);
            setDeviceAuthState("UNAUTHENTICATED");
            handleAppSignOut(null);
          }}
        />
      )}

      <NewDeviceSuccessModal
        isOpen={isNewDeviceSuccessOpen}
        previousDeviceName={previousDeviceName}
        onContinue={() => {
          setIsNewDeviceSuccessOpen(false);
          setDeviceAuthState("AUTHENTICATED_VERIFIED");
          toast.success("Welcome to E-Global Pay!");
        }}
      />
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
