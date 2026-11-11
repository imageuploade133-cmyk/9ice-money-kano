"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EstateSeller } from "@/estate/types";
import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";

interface SellerProfileModalProps {
  isOpen: boolean;
  seller: EstateSeller | null;
  currentPhoto?: string;
  isEditable?: boolean;
  onClose: () => void;
  onSaveProfile?: (updated: {
    agencyName: string;
    phone: string;
    email?: string;
    address: string;
    avatarUrl?: string;
    autoResponseText?: string;
    mutedFields?: ("phone" | "email" | "address" | "avatar")[];
  }) => Promise<void>;
  isSaving?: boolean;
}

export function SellerProfileModal({
  isOpen,
  seller,
  currentPhoto,
  isEditable = false,
  onClose,
  onSaveProfile,
  isSaving = false,
}: SellerProfileModalProps) {
  const [agencyName, setAgencyName] = useState(seller?.agencyName || "");
  const [phone, setPhone] = useState(seller?.phone || "");
  const [email, setEmail] = useState(seller?.email || "");
  const [address, setAddress] = useState(seller?.address || "");
  const [avatarUrl, setAvatarUrl] = useState(seller?.avatarUrl || "");
  const [autoResponseText, setAutoResponseText] = useState(seller?.autoResponseText || "");
  const [mutedFields, setMutedFields] = useState<("phone" | "email" | "address" | "avatar")[]>(
    seller?.mutedFields || []
  );
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);

  React.useEffect(() => {
    if (seller) {
      setAgencyName(seller.agencyName || "");
      setPhone(seller.phone || "");
      setEmail(seller.email || "");
      setAddress(seller.address || "");
      setAvatarUrl(seller.avatarUrl || "");
      setAutoResponseText(seller.autoResponseText || "");
      setMutedFields(seller.mutedFields || []);
    }
  }, [seller]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setAvatarUploadProgress(5);
    try {
      const result = await uploadImageSecurely(file, "agent_avatar", (percent) => {
        setAvatarUploadProgress(percent);
      });
      if (result.success && result.url) {
        setAvatarUrl(result.url);
        toast.success("Agent profile picture uploaded successfully!");
      } else {
        toast.error(result.error || "Failed to upload agent profile picture.");
      }
    } catch {
      toast.error("Failed to upload agent profile picture.");
    } finally {
      setTimeout(() => {
        setIsUploadingAvatar(false);
        setAvatarUploadProgress(0);
      }, 400);
    }
  };

  const toggleMutedField = (field: "phone" | "email" | "address" | "avatar") => {
    setMutedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  if (!isOpen || !seller) return null;

  const currentDisplayAvatar =
    avatarUrl ||
    seller.avatarUrl ||
    currentPhoto ||
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAhqRElSxFDYR0JkLrL3BmoTHpcQpwcpM8xiEOnGtTcV8dqv0FIMYVAxgz7tMMChcZxMlTa2-2ynaI3jIWoLsyt_hfOq8ILk52eJHTc0Ot0_rEl9aA6fYqKikhCmWGkw82ljlEttOLSEHGqM_XrwGNTAqYcnAliKIqqx6JvmHYxWU4vMcWp1WvRiDQDhCuSfoHxXfGhX0UQSjcA9sP2F2lVFfu9_7meiyzKguVTqcrOQ7LGww0OPJgP1b8eBW81_BBVIhpF2GzeT3M";

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveProfile) {
      await onSaveProfile({
        agencyName,
        phone,
        email,
        address,
        avatarUrl,
        autoResponseText,
        mutedFields,
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 w-full h-full bg-white z-[100015] flex flex-col justify-between overflow-y-auto no-scrollbar text-black font-hanken"
        >
          {/* Full Screen Top Header */}
          <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-between p-4 sm:p-6 space-y-6 pb-28">
            <div>
              <div className="flex items-center justify-between pb-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[24px]">
                    account_circle
                  </span>
                  <div>
                    <h3 className="font-bodoni text-base sm:text-lg font-bold text-black leading-tight">
                      {isEditable ? "Edit Agent Profile" : "Seller & Agent Profile"}
                    </h3>
                    <p className="text-[11px] text-gray-500 font-medium">
                      {isEditable ? "Update business & phone details" : "Agent contact & verification status"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 border-0 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <UploadProgressBar
                isUploading={isUploadingAvatar}
                progress={avatarUploadProgress}
                label="Uploading Profile Picture..."
              />

              {/* Premium Gradient Profile Card */}
              <div className="mt-5 p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#FFF5EB] via-[#FFEADB] to-[#FFE0CC] border border-[#FFD0A1]/80 flex flex-col items-center text-center space-y-3 shadow-xs">
                <div className="relative w-20 h-20 sm:w-24 sm:h-22 rounded-2xl overflow-hidden border-2 border-[#FC7A00] shadow-sm bg-white group">
                  {!isEditable && seller.mutedFields?.includes("avatar") ? (
                    <div className="w-full h-full bg-[#FC7A00] text-white font-black text-2xl flex items-center justify-center">
                      {seller.displayName[0]}
                    </div>
                  ) : (
                    <img src={currentDisplayAvatar} alt={seller.displayName} className="w-full h-full object-cover" />
                  )}
                  <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />

                  {isEditable && (
                    <label className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[10px] font-black uppercase cursor-pointer transition-opacity">
                      <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                      <span>{isUploadingAvatar ? "Uploading..." : "Change"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        disabled={isUploadingAvatar}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-base sm:text-lg text-black">{seller.displayName}</h4>
                    {seller.isVerified ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Verified Agent
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">
                        Pending Verification
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-black text-[#FC7A00] uppercase tracking-wider">
                    {seller.agencyName || "Independent Property Agent"}
                  </p>
                  {(!seller.mutedFields?.includes("email") || isEditable) && (
                    <p className="text-xs text-gray-500 font-mono">{seller.email}</p>
                  )}
                </div>
              </div>

              {/* Editable Form with Crisp Input Borders */}
              <div className="mt-6">
                {isEditable ? (
                  <form id="seller-profile-form" onSubmit={handleFormSubmit} className="space-y-4">
                    <div>
                      <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                        Agency / Business Name
                      </label>
                      <input
                        type="text"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                        placeholder="e.g. Apex Real Estate"
                        className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-bold text-black text-xs outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all shadow-2xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10.5px] font-black uppercase text-gray-500 block tracking-wider">
                          Contact Phone Number *
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleMutedField("phone")}
                          className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase border-0 cursor-pointer flex items-center gap-1 transition-all ${
                            mutedFields.includes("phone")
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {mutedFields.includes("phone") ? "visibility_off" : "visibility"}
                          </span>
                          <span>{mutedFields.includes("phone") ? "Muted (Hidden)" : "Visible"}</span>
                        </button>
                      </div>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 08012345678"
                        className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-bold text-black text-xs outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all shadow-2xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10.5px] font-black uppercase text-gray-500 block tracking-wider">
                          Agent Email Address *
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleMutedField("email")}
                          className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase border-0 cursor-pointer flex items-center gap-1 transition-all ${
                            mutedFields.includes("email")
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {mutedFields.includes("email") ? "visibility_off" : "visibility"}
                          </span>
                          <span>{mutedFields.includes("email") ? "Muted (Hidden)" : "Visible"}</span>
                        </button>
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. agent@domain.com"
                        className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-bold text-black text-xs outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all shadow-2xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10.5px] font-black uppercase text-gray-500 block tracking-wider">
                          Office / Business Address
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleMutedField("address")}
                          className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase border-0 cursor-pointer flex items-center gap-1 transition-all ${
                            mutedFields.includes("address")
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {mutedFields.includes("address") ? "visibility_off" : "visibility"}
                          </span>
                          <span>{mutedFields.includes("address") ? "Muted (Hidden)" : "Visible"}</span>
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. Suite 12, Victoria Island Plaza, Lagos"
                        className="w-full p-3.5 bg-gray-50 border border-gray-300 rounded-2xl font-semibold text-black text-xs outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all resize-none shadow-2xs"
                      />
                    </div>

                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-black block">Mute Profile Picture</span>
                        <span className="text-[10px] text-gray-500 font-medium block">
                          Hide photo from public users and display initial emblem instead
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleMutedField("avatar")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all ${
                          mutedFields.includes("avatar")
                            ? "bg-red-500 text-white shadow-2xs"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {mutedFields.includes("avatar") ? "Muted" : "Visible"}
                      </button>
                    </div>

                    <div>
                      <label className="text-[10.5px] font-black uppercase text-[#FC7A00] block mb-1.5 tracking-wider">
                        Custom Auto-Response Message (Inquiry Chat)
                      </label>
                      <textarea
                        rows={3}
                        value={autoResponseText}
                        onChange={(e) => setAutoResponseText(e.target.value)}
                        placeholder="e.g. Thank you for your inquiry! I am currently inspecting properties. I will call you back within 15 minutes."
                        className="w-full p-3.5 bg-orange-50/50 border border-orange-200 rounded-2xl font-semibold text-black text-xs outline-none focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20 transition-all resize-none shadow-2xs"
                      />
                      <p className="text-[10px] text-gray-400 font-bold mt-1">
                        This automated message is instantly sent to prospective buyers/tenants when they send an inquiry.
                      </p>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3 text-xs">
                      <div>
                        <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider mb-0.5">
                          Phone Number
                        </span>
                        <span className="font-mono font-extrabold text-black text-sm">
                          {seller.mutedFields?.includes("phone")
                            ? "Contact via Direct Inquiry"
                            : seller.phone || "Not specified"}
                        </span>
                      </div>
                      {!seller.mutedFields?.includes("email") && (
                        <div>
                          <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider mb-0.5">
                            Email Address
                          </span>
                          <span className="font-mono font-semibold text-gray-800">
                            {seller.email}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider mb-0.5">
                          Office Address
                        </span>
                        <span className="font-medium text-gray-700 leading-relaxed">
                          {seller.mutedFields?.includes("address")
                            ? "Location details available on request"
                            : seller.address || "Location not provided"}
                        </span>
                      </div>
                    </div>

                    {!seller.mutedFields?.includes("phone") && seller.phone && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <a
                          href={`tel:${seller.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              window.open(`tel:${seller.phone}`, "_system");
                            }
                          }}
                          className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-2xl text-center cursor-pointer border-0 flex items-center justify-center gap-2 shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[18px]">call</span>
                          <span>Call Agent</span>
                        </a>
                        <a
                          href={`https://wa.me/${(seller.phone || "").replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="py-3.5 bg-black hover:bg-gray-900 text-white font-black text-xs uppercase rounded-2xl text-center cursor-pointer border-0 flex items-center justify-center gap-2 shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[18px]">chat</span>
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Floating/Fixed Mobile Safe Action Footer */}
            {isEditable && (
              <div className="fixed bottom-0 left-0 right-0 z-[100001] bg-white border-t border-gray-200 p-4 shadow-lg flex justify-center">
                <div className="w-full max-w-2xl flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-1/2 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold text-xs uppercase rounded-2xl border-0 cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="seller-profile-form"
                    disabled={isSaving}
                    className="w-1/2 py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>{isSaving ? "Saving..." : "Save Profile"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
