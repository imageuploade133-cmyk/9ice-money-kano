"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FAQ {
  question: string;
  answer: string;
}

interface SupportFaqSectionProps {
  faqs: FAQ[];
}

export function SupportFaqSection({ faqs }: SupportFaqSectionProps) {
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);

  return (
    <section className="premium-gradient-card premium-gradient-border p-5 space-y-3 bg-white shadow-sm">
      <h4 className="font-hanken font-bold text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-2">
        Frequently Asked Questions
      </h4>

      <div className="space-y-2">
        {faqs.map((faq, idx) => (
          <div key={idx} className="border-b border-gray-50 pb-2 last:border-none last:pb-0">
            <button
              type="button"
              onClick={() => setActiveFAQ(activeFAQ === idx ? null : idx)}
              className="w-full flex justify-between items-center text-left py-1 outline-none text-black hover:text-[#FC7A00] transition-colors cursor-pointer"
            >
              <span className="font-hanken font-bold text-[11px] pr-2">{faq.question}</span>
              <span className="material-symbols-outlined text-[16px] text-gray-400 flex-shrink-0">
                {activeFAQ === idx ? "expand_less" : "expand_more"}
              </span>
            </button>
            <AnimatePresence>
              {activeFAQ === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="font-hanken text-[10px] text-gray-400 mt-1 leading-relaxed font-semibold">
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
