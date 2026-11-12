"use client";

import React from "react";
import { toast } from "sonner";

interface Contact {
  id: string;
  title: string;
  subtitle: string;
  phone: string;
  formattedPhone: string;
  icon: string;
  badge: string;
  color: string;
}

interface ContactHotlinesSectionProps {
  contacts: Contact[];
}

export function ContactHotlinesSection({ contacts }: ContactHotlinesSectionProps) {
  const handleCopyPhone = (phone: string, title: string) => {
    navigator.clipboard.writeText(phone);
    toast.success(`${title} number copied to clipboard!`);
  };

  return (
    <section className="space-y-3">
      <h4 className="font-hanken font-bold text-[12px] uppercase tracking-wider text-gray-400 px-1">
        Select Contact Hotline
      </h4>

      <div className="space-y-3">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="premium-gradient-card premium-gradient-border p-4 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="flex gap-3 items-center min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-700 flex-shrink-0">
                <span className="material-symbols-outlined text-[20px]">{contact.icon}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-hanken font-bold text-xs text-black truncate">{contact.title}</p>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-[8px] font-black uppercase text-gray-500 rounded tracking-wider">
                    {contact.badge}
                  </span>
                </div>
                <p className="font-mono font-bold text-[13px] text-black mt-1 tracking-tight">
                  {contact.formattedPhone}
                </p>
                <p className="font-hanken text-[9px] text-gray-400 mt-0.5">{contact.subtitle}</p>
              </div>
            </div>

            <div className="flex gap-1.5 flex-shrink-0 ml-2">
              <button
                type="button"
                onClick={() => handleCopyPhone(contact.phone, contact.title)}
                className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 hover:text-black active:scale-90 transition-all cursor-pointer"
                title="Copy Number"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
              </button>
              <a
                href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.open(`tel:${contact.phone.replace(/\s+/g, "")}`, "_system");
                  }
                }}
                className="w-8 h-8 rounded-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
                title="Call Now"
              >
                <span className="material-symbols-outlined text-[16px]">call</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
