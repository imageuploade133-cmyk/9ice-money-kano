"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { FeatureToggles, DEFAULT_FEATURE_TOGGLES } from "@/lib/feature-toggle";

export interface AppConfig {
  featureToggles?: FeatureToggles;
  appName?: string;
  logoUrl: string;
  receiptLogoUrl?: string;
  receiptName?: string;
  receiptBgImageUrl?: string;
  receiptBgImageEnabled?: boolean;
  receiptBgImageOpacity?: number;
  receiptCbnText?: string;
  statementLogoUrl?: string;
  statementSignatureUrl?: string;
  statementStampUrl?: string;
  statementWatermarkUrl?: string;
  statementWatermarkSize?: number;
  statementWatermarkOpacity?: number;
  supportPhone1: string;
  supportPhone2: string;
  supportEmail: string;
  totalUsers: number;
  globalNgnBalance: number;
  globalUsdBalance: number;
  globalXofBalance?: number;
  todayPayout?: number;
  todayNetFlow?: number;
  appVersion?: string;
  totalFixedDeposit?: number;
  todayDeposit?: number;
  todayTransfer?: number;
  totalAirtimePurchase?: number;
  totalBonus?: number;
  newDeviceDetectorEnabled?: boolean;
  maxKycUploadSizeMb?: number;
  totalTransferProfit?: number;
  totalDataProfit?: number;
  bannerOverlayFadeEnabled?: boolean;
  bannerSlideIntervalSeconds?: number;
  bannerBorderEnabled?: boolean;
  bannerBorderColor?: string;
  bannerBackgroundColor?: string;
  bannerImageMode?: "cover" | "contain";
  bannerSlideEffect?: "fade" | "slide";
  bannerImagePosition?: string;
  bannerHeightMobile?: number;
  bannerHeightDesktop?: number;
  bannerTransferPosition?: "top" | "bottom";
  bannerShowIndicators?: boolean;
  bannerMarginBottom?: number;
  whatsappPollingEnabled?: boolean;
  whatsappPollingIntervalMinutes?: number;
  minTransferAmount?: number;
  globalMinTransferAmount?: number;
  tier1MaxBalance?: number;
  tier1DailyDepositLimit?: number;
  tier1DailyTransferLimit?: number;
  tier1SingleTransferLimit?: number;

  tier2MaxBalance?: number;
  tier2DailyDepositLimit?: number;
  tier2DailyTransferLimit?: number;
  tier2DailyLimit?: number;
  tier2SingleTransferLimit?: number;
  tier2SingleLimit?: number;

  tier3MaxBalance?: number;
  tier3DailyDepositLimit?: number;
  tier3DailyTransferLimit?: number;
  tier3DailyLimit?: number;
  tier3SingleTransferLimit?: number;
  tier3SingleLimit?: number;

  dailyResetWindowHours?: number;
  tierUpgradeSelectionTitle?: string;
  acceptableGovernmentIds?: string[];
  hasCustomImgbbApiKey?: boolean;
  imgbbApiKey?: string;
  appVersionPushNotificationEnabled?: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  appVersionPushNotificationEnabled: true,
  featureToggles: DEFAULT_FEATURE_TOGGLES,
  appName: "E-Global Pay",
  logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
  receiptLogoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
  receiptName: "E-TECH GLOBAL HUB",
  receiptBgImageUrl: "",
  receiptBgImageEnabled: false,
  receiptBgImageOpacity: 0.15,
  receiptCbnText: "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC.",
  supportPhone1: "+234 800 345 6225",
  supportPhone2: "+234 901 234 5678",
  supportEmail: "support@e-globaltechhub.com",
  totalUsers: 0,
  globalNgnBalance: 0,
  globalUsdBalance: 0,
  globalXofBalance: 0,
  todayPayout: 0,
  todayNetFlow: 0,
  appVersion: "1.0.0",
  totalFixedDeposit: 0,
  todayDeposit: 0,
  todayTransfer: 0,
  totalAirtimePurchase: 0,
  totalBonus: 0,
  newDeviceDetectorEnabled: true,
  maxKycUploadSizeMb: 10,
  totalTransferProfit: 0,
  totalDataProfit: 0,
  bannerOverlayFadeEnabled: true,
  bannerSlideIntervalSeconds: 5,
  bannerBorderEnabled: true,
  bannerBorderColor: "#e5e7eb",
  bannerBackgroundColor: "#111827",
  bannerImageMode: "cover",
  bannerSlideEffect: "fade",
  bannerImagePosition: "center",
  bannerHeightMobile: 150,
  bannerHeightDesktop: 220,
  bannerTransferPosition: "top",
  bannerShowIndicators: true,
  bannerMarginBottom: 24,
  whatsappPollingEnabled: true,
  whatsappPollingIntervalMinutes: 1,
  statementWatermarkUrl: "",
  statementWatermarkSize: 100,
  statementWatermarkOpacity: 0.15,
  tier1MaxBalance: 300000,
  tier1DailyDepositLimit: 500000,
  tier1DailyTransferLimit: 500000,
  tier1SingleTransferLimit: 200000,

  tier2MaxBalance: 5000000,
  tier2DailyDepositLimit: 5000000,
  tier2DailyTransferLimit: 5000000,
  tier2DailyLimit: 5000000,
  tier2SingleTransferLimit: 2000000,
  tier2SingleLimit: 2000000,

  tier3MaxBalance: 50000000,
  tier3DailyDepositLimit: 50000000,
  tier3DailyTransferLimit: 50000000,
  tier3DailyLimit: 50000000,
  tier3SingleTransferLimit: 10000000,
  tier3SingleLimit: 10000000,

  dailyResetWindowHours: 24,
  tierUpgradeSelectionTitle: "SELECT TARGET UPGRADE TIER",
  acceptableGovernmentIds: ["National ID Card (NIN)", "International Passport", "Driver's License", "Voter's Card"],
};

interface ConfigContextProps {
  config: AppConfig;
  isConfigLoaded: boolean;
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>;
  resetConfig: () => Promise<void>;
  syncRealFirebaseData: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextProps | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isConfigLoaded, setIsConfigLoaded] = useState<boolean>(false);

  // Helper to fetch public visual configuration via serverless API
  const fetchPublicConfigFallback = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfig((prev) => ({
          ...prev,
          ...data.config,
        }));
      }
    } catch (err) {
      console.warn("Failed to fetch public config fallback:", err);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  // Sync core visual/support configs directly from Firestore config document
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    let unsubscribeToggles: (() => void) | null = null;

    const setupListener = () => {
      try {
        unsubscribe = onSnapshot(doc(db, "config", "app"), (docSnap) => {
          if (docSnap.exists()) {
            const rawData = docSnap.data() as Record<string, any>;
            // Explicitly strip any sensitive fields such as imgbbApiKey even if present in Firestore
            const { imgbbApiKey, secretKey, apiKey, ...safeRemoteData } = rawData;
            const hasCustomKey = Boolean(
              safeRemoteData.hasCustomImgbbApiKey ||
              (rawData.imgbbApiKey && typeof rawData.imgbbApiKey === "string" && rawData.imgbbApiKey.trim())
            );
            setConfig((prev) => ({
              ...prev,
              ...safeRemoteData,
              hasCustomImgbbApiKey: hasCustomKey,
              // Preserve existing featureToggles if safeRemoteData does not contain featureToggles
              featureToggles: safeRemoteData.featureToggles || prev.featureToggles || DEFAULT_FEATURE_TOGGLES,
            }));
            setIsConfigLoaded(true);
          } else {
            setIsConfigLoaded(true);
          }
        }, (error) => {
          setIsConfigLoaded(true);
          if (error.code === "permission-denied") {
            fetchPublicConfigFallback();
          } else {
            console.warn("Config listener error:", error);
          }
        });

        // Real-time listener specifically for config/feature_toggles document
        unsubscribeToggles = onSnapshot(doc(db, "config", "feature_toggles"), (docSnap) => {
          if (docSnap.exists()) {
            const togglesData = docSnap.data()?.toggles;
            if (togglesData) {
              setConfig((prev) => ({
                ...prev,
                featureToggles: {
                  ...DEFAULT_FEATURE_TOGGLES,
                  ...togglesData,
                },
              }));
            }
          }
        }, (error) => {
          if (error.code === "permission-denied") {
            fetchPublicConfigFallback();
          }
        });
      } catch (e) {
        console.error("Firestore initialization error:", e);
      }
    };

    // Attempt to listen when Firebase Auth is loaded
    const unsubscribeAuth = auth.onAuthStateChanged((user: unknown) => {
      if (user) {
        if (unsubscribe) unsubscribe();
        setupListener();
      } else {
        // Load config from serverless API if unauthenticated
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        fetchPublicConfigFallback();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribe) unsubscribe();
      if (unsubscribeToggles) unsubscribeToggles();
    };
  }, []);

  // Sync real counts, balances and aggregated sum of all registered accounts dynamically from Firebase
  const syncRealFirebaseData = async () => {
    try {
      // Rather than running direct client-side collection scans which can fail with permission exceptions,
      // let's fetch from the metrics endpoint or handle securely
      const res = await fetch("/api/admin/config");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig((prev) => ({
            ...prev,
            ...data.config,
          }));
          return;
        }
      }
    } catch (e) {
      console.warn("Real-time Firebase metrics agg fetch failed. (Falling back to local cache):", e);
    }
  };

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    try {
      // Securely update config through the serverless admin config API
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save configuration server-side.");
      }

      // Update state with updated server-authoritative data
      if (data.config) {
        setConfig((prev) => ({
          ...prev,
          ...data.config,
        }));
      }
    } catch (e) {
      console.error("Failed to commit settings updates to Firebase Firestore:", e);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("app_global_config_fallback", JSON.stringify(newConfig));
      }
      throw e;
    }
  };

  const resetConfig = async () => {
    setConfig(DEFAULT_CONFIG);
    try {
      await updateConfig(DEFAULT_CONFIG);
    } catch (e) {
      console.error("Failed to reset config doc:", e);
    }
  };

  return (
    <ConfigContext.Provider value={{ config, isConfigLoaded, updateConfig, resetConfig, syncRealFirebaseData }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useAppConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within a ConfigProvider");
  }
  return context;
};
