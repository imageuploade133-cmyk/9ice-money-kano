"use client";

import { triggerHaptic } from "@/lib/haptics";

import React from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";

import { SupportHeroSection } from "@/components/support/SupportHeroSection";
import { SupportNoticeSection } from "@/components/support/SupportNoticeSection";
import { ContactHotlinesSection } from "@/components/support/ContactHotlinesSection";
import { QuickDisputeSection } from "@/components/support/QuickDisputeSection";
import { SupportFaqSection } from "@/components/support/SupportFaqSection";
import { SupportChatSection } from "@/components/support/SupportChatSection";

export default function SupportPage() {
  const { userData, user } = useAuth();
  const { config } = useAppConfig();

  const userName = (userData?.name || user?.displayName || "Captain") as string;
  const currentPhoto = (userData?.photoURL || user?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M") as string;

  const CONTACTS = [
    {
      id: "priority",
      title: "Priority Helpline",
      subtitle: "24/7 Dedicated Call Center",
      phone: config.supportPhone1,
      formattedPhone: config.supportPhone1,
      icon: "phone_in_talk",
      badge: "Toll Free",
      color: "from-[#FC7A00] to-[#FF9022]",
    },
    {
      id: "whatsapp",
      title: "WhatsApp VIP Chat",
      subtitle: "Instant Chat Support",
      phone: config.supportPhone2,
      formattedPhone: config.supportPhone2,
      icon: "chat",
      badge: "Fastest Response",
      color: "from-emerald-500 to-teal-600",
    },
  ];

  const FAQs = [
    {
      question: "What information should I prepare before calling?",
      answer: "Please have your registered email address and the transaction reference ID (if applicable) ready. This helps our specialist verify your profile instantly."
    },
    {
      question: "Is support really free?",
      answer: "Yes, our Priority Toll-Free line (+234 800 E-GLOBAL) is completely free of charge. Standard mobile operator fees may apply to international numbers."
    },
    {
      question: "What should I do if my card is lost or compromised?",
      answer: "You should immediately lock your card in the Profile tab, or call our priority line directly. An agent will suspend the card and initiate a replacement in minutes."
    }
  ];

  return (
    <>
      <Header userName={userName.split(" ")[0].toUpperCase()} profileImage={currentPhoto} />

      <main className="mt-20 min-[375px]:mt-24 px-margin-mobile flex-grow pb-28 min-[375px]:pb-32 text-black">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto space-y-5"
        >
          {/* Header Action Nav */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { triggerHaptic(); window.history.back(); }}
              className="w-10 h-10 rounded-full border border-gray-150 bg-white flex items-center justify-center text-gray-700 hover:text-black hover:border-gray-200 active:scale-95 transition-all duration-300 cursor-pointer shadow-none"
              title="Go Back"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
            </button>
            <div>
              <h2 className="font-hanken font-extrabold text-lg text-black leading-tight">Help & Support</h2>
              <p className="font-hanken text-[11px] text-gray-400 font-bold uppercase tracking-wider">E-Tech Global Hub 24/7</p>
            </div>
          </div>

          {/* Premium Hero Card */}
          <SupportHeroSection userName={userName} />

          {/* Real-time Administrator Support Chat */}
          <SupportChatSection />

          {/* Core Instruction Steps */}
          <SupportNoticeSection />

          {/* Contact Methods (Interactive Hotlines) */}
          <ContactHotlinesSection contacts={CONTACTS} />

          {/* Priority Quick Dispute Tickets */}
          <QuickDisputeSection />

          {/* Quick FAQ Section */}
          <SupportFaqSection faqs={FAQs} />
        </motion.div>
      </main>

      <BottomNav />
    </>
  );
}
