"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { isFeatureEnabled, getFeatureDisabledMessage, FeatureToggleKey } from "@/lib/feature-toggle";
import { useRouter } from "next/navigation";
import { KycVerificationDrawer } from "@/components/profile/KycVerificationDrawer";
import { toast } from "sonner";

const services = [
  { icon: "cell_tower", label: "Airtime", color: "text-secondary", href: "/bills?type=airtime" },
  { icon: "swap_vert", label: "Data", color: "text-secondary", href: "/bills?type=data" },
  { icon: "tv", label: "TV", color: "text-secondary", href: "/bills?type=cable" },
  { icon: "bolt", label: "Electricity", color: "text-secondary", href: "/bills?type=utility" },
  { icon: "school", label: "WAEC", color: "text-secondary", href: "/bills?type=waec" },
  { icon: "sports_basketball", label: "Betting", color: "text-secondary", href: "/bills?type=betting" },
  { icon: "domain", label: "Property", color: "text-[#FC7A00]", href: "/estate", fill: true },
  { icon: "credit_card", label: "Cards", color: "text-primary", href: "/cards", fill: true },
  { icon: "group_add", label: "Referral", color: "text-[#FC7A00]", href: "/referrals", fill: true },
  { icon: "real_estate_agent", label: "Loan", color: "text-primary", href: "#", action: "loan" },
  { icon: "diamond", label: "Wealth", color: "text-primary", href: "#", action: "wealth" },
  { icon: "apps", label: "More", color: "text-primary", href: "#", action: "more" },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

export const ServiceGrid: React.FC = () => {
  const { userData } = useAuth();
  const { config } = useAppConfig();
  const router = useRouter();

  // Loading state for clicked service icon
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);

  // Modal states
  const [activeModal, setActiveModal] = useState<"loan" | "wealth" | "more" | null>(null);
  const [isKycDrawerOpen, setIsKycDrawerOpen] = useState(false);

  // Clear loading spinner if modal closes or route changes
  useEffect(() => {
    if (!activeModal) {
      setLoadingLabel(null);
    }
  }, [activeModal]);

  // Prevent background scrolling while the service info modal is active
  useEffect(() => {
    if (activeModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeModal]);

  const handleServiceClick = (service: typeof services[0]) => {
    setLoadingLabel(service.label);
    const isMockMode = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (userData?.kycStatus !== "VERIFIED" && !isMockMode) {
      toast.warning("Please complete your identity verification (KYC) to access this activity.");
      setIsKycDrawerOpen(true);
      setLoadingLabel(null);
      return;
    }
    if (service.action) {
      setActiveModal(service.action as "loan" | "wealth" | "more");
    }
  };

  const handleLinkClick = (e: React.MouseEvent, service: typeof services[0]) => {
    e.preventDefault();

    // Map service route to feature toggle key
    let featureKey: FeatureToggleKey | null = null;
    if (service.href.startsWith("/bills")) featureKey = "bills";
    else if (service.href === "/estate") featureKey = "estate";
    else if (service.href === "/cards") featureKey = "virtual_cards";
    else if (service.href === "/referrals") featureKey = "referral";

    if (featureKey && !isFeatureEnabled(config?.featureToggles, featureKey)) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, featureKey));
      return;
    }

    setLoadingLabel(service.label);

    const isMockMode = typeof window !== "undefined" && sessionStorage.getItem("mock") === "true";
    if (service.href !== "/referrals" && userData?.kycStatus !== "VERIFIED" && !isMockMode) {
      toast.warning("Please complete your identity verification (KYC) to access this utility.");
      setIsKycDrawerOpen(true);
      setLoadingLabel(null);
      return;
    }
    router.push(service.href);
  };

  return (
    <>
      <section className="grid grid-cols-4 gap-3 min-[360px]:gap-4 mb-stack-lg text-black">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="col-span-4 grid grid-cols-4 gap-1 min-[360px]:gap-2"
        >
          {services.map((service) => {
            const isLink = service.href !== "#";
            const isLoading = loadingLabel === service.label;

            const content = (
              <div className="flex flex-col items-center gap-1 min-[360px]:gap-1.5 py-1.5 min-[360px]:py-2.5 min-w-0 w-full relative">
                {/* Premium gold-orange/emerald gradient border matching physical card */}
                <div className="p-2 min-[360px]:p-2.5 min-[390px]:p-3 bg-surface-container rounded-lg border flex items-center justify-center flex-shrink-0 premium-gradient-border relative min-w-[40px] min-h-[40px] min-[360px]:min-w-[44px] min-[360px]:min-h-[44px]">
                  {isLoading ? (
                    <span className="material-symbols-outlined text-[18px] min-[360px]:text-[20px] text-[#FC7A00] animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <span
                      className={cn("material-symbols-outlined text-[16px] min-[360px]:text-[18px] min-[390px]:text-xl", service.color)}
                      style={service.fill ? { fontVariationSettings: '"FILL" 1' } : {}}
                    >
                      {service.icon}
                    </span>
                  )}
                </div>
                <span className="font-label-sm text-[9px] min-[360px]:text-[10px] min-[390px]:text-xs text-on-surface-variant/80 truncate w-full text-center mt-1 font-semibold">
                  {service.label}
                </span>
              </div>
            );

            if (isLink) {
              return (
                <button
                  key={service.label}
                  onClick={(e) => handleLinkClick(e, service)}
                  className="w-full flex justify-center bg-transparent border-0 p-0"
                >
                  <motion.div
                    variants={item}
                    whileTap={{ scale: 0.9 }}
                    className="w-full flex flex-col items-center cursor-pointer"
                  >
                    {content}
                  </motion.div>
                </button>
              );
            }

            return (
              <motion.button
                key={service.label}
                variants={item}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleServiceClick(service)}
                className="flex flex-col items-center cursor-pointer w-full bg-transparent border-0 p-0"
              >
                {content}
              </motion.button>
            );
          })}
        </motion.div>
      </section>

      {/* Modern, 90% Full Screen sliding Info Modals */}
      <AnimatePresence>
        {activeModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
            />

            {/* 90% Height Bottom Sheet Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] z-[99999] p-6 pb-8 shadow-none text-black h-[90vh] max-h-[90vh] flex flex-col justify-between"
            >
              {/* Grab handle */}
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-5 mx-auto" />

              <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
                <h3 className="font-hanken font-extrabold text-base text-black uppercase tracking-wider">
                  {activeModal === "loan" ? "E-Tech Loans" : activeModal === "wealth" ? "E-Tech Wealth" : "More Utilities"}
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              {/* Centered Modal content */}
              <div className="flex-grow flex flex-col justify-center items-center text-center px-4 space-y-5">
                <div className={cn(
                  "w-20 h-20 rounded-full border flex items-center justify-center shadow-inner animate-pulse-subtle",
                  activeModal === "loan" ? "bg-amber-50 border-amber-100 text-[#FC7A00]" : "bg-blue-50 border-blue-100 text-[#0F62FE]"
                )}>
                  <span className="material-symbols-outlined text-[40px]">
                    {activeModal === "loan" ? "real_estate_agent" : activeModal === "wealth" ? "diamond" : "apps"}
                  </span>
                </div>

                <div className="space-y-2">
                  <h4 className="font-hanken font-black text-lg text-gray-900 leading-tight">
                    {activeModal === "loan" ? "Eligibility Check" : "Coming Soon!"}
                  </h4>
                  <p className="font-hanken text-xs text-gray-500 leading-relaxed font-semibold">
                    {activeModal === "loan" ? (
                      "You are not eligible for a loan at this time. Please continue to make consistent transactions with your account to build your credit score."
                    ) : activeModal === "wealth" ? (
                      "E-Tech Wealth management and high-yield locked saving schemes are currently being optimized. Stay tuned for exciting developments!"
                    ) : (
                      "E-Tech Concierge: Exploring advanced features, multi-currency wallets, and multi-network utilities. Coming soon in v1.1.0!"
                    )}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <div className="pt-6 border-t border-gray-100 w-full">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white text-xs font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all shadow-none"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Unified Global KYC Verification Drawer */}
      <KycVerificationDrawer
        isOpen={isKycDrawerOpen}
        onClose={() => setIsKycDrawerOpen(false)}
        onSuccess={() => setIsKycDrawerOpen(false)}
      />
    </>
  );
};
