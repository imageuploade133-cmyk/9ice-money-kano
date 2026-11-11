"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { EstateProperty, EstateSeller, EstateSettingsData } from "@/estate/types";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { EstateChatInquiryModal } from "./EstateChatInquiryModal";

interface PropertyDetailModalProps {
  isOpen: boolean;
  property: EstateProperty | null;
  settings?: EstateSettingsData | null;
  onClose: () => void;
  onSubmitInquiry: (
    message: string,
    options?: { messageType?: "text" | "voice"; audioData?: string; audioDuration?: number }
  ) => Promise<boolean | void> | void;
  onReportProperty: (reason: string, details: string) => void;
  onInspectAgent?: () => void;
  onOpenReportDrawer?: () => void;
  inquiryCount?: number;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({
  isOpen,
  property,
  settings,
  onClose,
  onSubmitInquiry,
  onReportProperty,
  onInspectAgent,
  onOpenReportDrawer,
  inquiryCount = 0,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  const [enableChat, setEnableChat] = useState<boolean>(settings ? settings.enableChat !== false : true);
  const [enableShare, setEnableShare] = useState<boolean>(settings ? settings.enableShare !== false : true);
  const [enableReport, setEnableReport] = useState<boolean>(settings ? settings.enableReport !== false : true);
  const [enableCalls, setEnableCalls] = useState<boolean>(settings ? settings.enableCalls !== false : true);

  // Publisher full agent state
  const [publisherAgent, setPublisherAgent] = useState<EstateSeller | null>(null);
  const [isLoadingPublisher, setIsLoadingLoadingPublisher] = useState(false);

  useModalBackHandler(isOpen, onClose, property ? `property-detail-${property.id}` : "property-detail");

  // Sync estate settings and fetch agent details when property opens
  useEffect(() => {
    if (settings) {
      setEnableChat(settings.enableChat !== false);
      setEnableShare(settings.enableShare !== false);
      setEnableReport(settings.enableReport !== false);
      setEnableCalls(settings.enableCalls !== false);
    } else if (isOpen) {
      fetch("/api/estate/settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.settings) {
            setEnableChat(data.settings.enableChat !== false);
            setEnableShare(data.settings.enableShare !== false);
            setEnableReport(data.settings.enableReport !== false);
            setEnableCalls(data.settings.enableCalls !== false);
          }
        })
        .catch(() => {});
    }

    if (property?.sellerId && isOpen) {
      setIsLoadingLoadingPublisher(true);
      fetch(`/api/estate/sellers?sellerId=${property.sellerId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.seller) {
            setPublisherAgent(data.seller);
          } else {
            setPublisherAgent(null);
          }
        })
        .catch(() => setPublisherAgent(null))
        .finally(() => setIsLoadingLoadingPublisher(false));
    } else {
      setPublisherAgent(null);
    }
  }, [property?.sellerId, isOpen]);

  const handleOpenChat = () => {
    if (!enableChat) {
      toast.error("Chat is disabled at this time");
      return;
    }
    setIsChatModalOpen(true);
  };

  if (!isOpen || !property) return null;

  const images = property.images && property.images.length > 0 ? property.images : [];

  const fullLocationString = `${property.location?.address || ""}, ${property.location?.city || ""}, ${property.location?.state || "Nigeria"}`.replace(/^,\s*/, "");

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: property.title,
        text: `Check out ${property.title} for ${property.purpose} on E-Global Estate!`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Property link copied to clipboard!");
    }
  };

  const handleOpenGoogleMaps = () => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLocationString)}`;
    if (typeof window !== "undefined") {
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
    }
  };

  const agentPhone = publisherAgent?.phone || property.sellerPhone;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[100008] bg-white w-full h-full flex flex-col justify-between overflow-hidden text-black font-hanken"
        >
          {/* Header Bar */}
          <div className="px-4 py-3.5 flex items-center justify-between flex-shrink-0 bg-white z-20">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all cursor-pointer border-0 active:scale-90 flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <div className="min-w-0">
                <h2 className="font-extrabold text-xs min-[375px]:text-sm text-black line-clamp-2 break-words uppercase tracking-tight leading-tight">
                  {property.title}
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                  For {property.purpose} • {property.propertyType}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {enableReport && onOpenReportDrawer && (
                <button
                  type="button"
                  onClick={onOpenReportDrawer}
                  className="w-9 h-9 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-all cursor-pointer border-0 active:scale-90"
                  title="Report Listing"
                >
                  <span className="material-symbols-outlined text-[18px]">flag</span>
                </button>
              )}

              {enableShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all cursor-pointer border-0 active:scale-90"
                  title="Share Property"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 min-[425px]:p-6 space-y-5 custom-scrollbar pb-24 sm:pb-28">
            {/* Main Featured Image Gallery Viewer */}
            <div className="space-y-2">
              <div
                onClick={() => setFullscreenImageIndex(activeImageIndex)}
                className="w-full h-64 min-[425px]:h-80 rounded-3xl bg-gray-100 relative overflow-hidden flex items-center justify-center p-1 border border-gray-100 cursor-pointer group shadow-2xs"
              >
                {images[activeImageIndex] ? (
                  <Image
                    src={images[activeImageIndex]}
                    alt={property.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    unoptimized
                  />
                ) : (
                  <span className="material-symbols-outlined text-[56px] text-gray-300">
                    domain
                  </span>
                )}

                <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-black/75 text-white backdrop-blur-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px]">zoom_in</span>
                  <span>{activeImageIndex + 1} / {images.length || 1}</span>
                </span>

                {/* Agent Icon & Business Name Overlay on Top-Left of Image */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onInspectAgent) onInspectAgent();
                  }}
                  className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-black shadow-md hover:bg-white active:scale-95 transition-all border border-white/40 cursor-pointer overflow-hidden max-w-[70%]"
                  title="View Agent Profile"
                >
                  {publisherAgent?.avatarUrl && !publisherAgent.mutedFields?.includes("avatar") ? (
                    <div className="w-6 h-6 rounded-full overflow-hidden relative border border-[#FC7A00] flex-shrink-0">
                      <Image src={publisherAgent.avatarUrl} alt="Agent" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FC7A00] to-[#E06600] text-white font-black text-[10px] flex items-center justify-center flex-shrink-0 shadow-2xs">
                      {(publisherAgent?.displayName || property.sellerName || "A")[0]}
                    </div>
                  )}
                  <span className="text-[10px] sm:text-[11px] font-black uppercase text-black tracking-tight truncate">
                    {publisherAgent?.agencyName || publisherAgent?.displayName || property.sellerName || "Verified Agent"}
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-[#FC7A00] flex-shrink-0">
                    verified
                  </span>
                </button>

                <span
                  className={`absolute top-3 right-3 px-3 py-1 rounded-md text-[9.5px] font-black uppercase tracking-wider text-white shadow-2xs ${
                    property.purpose === "Sale"
                      ? "bg-emerald-600"
                      : property.purpose === "Short-let"
                      ? "bg-purple-600"
                      : "bg-[#FC7A00]"
                  }`}
                >
                  For {property.purpose}
                </span>
              </div>

              {/* Thumbnails list */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`w-16 h-16 rounded-2xl border-2 overflow-hidden flex-shrink-0 relative cursor-pointer transition-all ${
                        activeImageIndex === idx
                          ? "border-[#FC7A00] scale-105 shadow-2xs"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <Image src={img} alt="Thumbnail" fill className="object-cover" unoptimized />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Full Property Title Displayed Prominently with Gradient Background & Border Removed */}
            <div className="p-4.5 rounded-3xl bg-gradient-to-r from-orange-50/80 via-amber-50 to-orange-100/60 shadow-2xs space-y-1 border-0">
              <span className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider block">
                Property Title
              </span>
              <h1 className="font-bodoni font-black text-base min-[375px]:text-lg text-black leading-snug break-words uppercase">
                {property.title}
              </h1>
            </div>

            {/* Price Card Container with Luxury Gradient Border */}
            <div className="bg-gradient-to-r from-[#FC7A00] via-amber-300 to-[#E06600] p-[1.5px] rounded-3xl shadow-2xs">
              <div className="bg-white p-4 rounded-[22.5px] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block">Listing Price</span>
                  <span className="font-mono text-2xl font-black text-[#FC7A00]">
                    ₦{property.price.toLocaleString()}
                  </span>
                  {property.purpose !== "Sale" && property.pricePeriod && property.pricePeriod !== "None" && (
                    <span className="text-xs text-gray-600 font-extrabold"> /{property.pricePeriod}</span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-gray-400 block">Category</span>
                  <span className="font-extrabold text-xs text-black block truncate max-w-[160px]">
                    {property.propertyType}
                  </span>
                  <span className="text-[10px] font-bold text-[#FC7A00] uppercase block">
                    For {property.purpose}
                  </span>
                </div>
              </div>
            </div>

            {/* Property Key Metrics Grid */}
            <div className="bg-gradient-to-r from-[#FC7A00]/40 via-amber-200/50 to-[#E06600]/40 p-[1.5px] rounded-3xl shadow-2xs">
              <div className="bg-white p-3.5 rounded-[22.5px] grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-orange-50/50 rounded-2xl space-y-0.5 border border-orange-100">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">bed</span>
                  <span className="text-[9.5px] font-black uppercase text-gray-400 block">Bedrooms</span>
                  <span className="font-mono font-black text-sm text-black block">{property.bedrooms || "-"}</span>
                </div>
                <div className="p-3 bg-orange-50/50 rounded-2xl space-y-0.5 border border-orange-100">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">bathtub</span>
                  <span className="text-[9.5px] font-black uppercase text-gray-400 block">Bathrooms</span>
                  <span className="font-mono font-black text-sm text-black block">{property.bathrooms || "-"}</span>
                </div>
                <div className="p-3 bg-orange-50/50 rounded-2xl space-y-0.5 border border-orange-100">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">square_foot</span>
                  <span className="text-[9.5px] font-black uppercase text-gray-400 block">Size</span>
                  <span className="font-mono font-black text-xs text-black block truncate">{property.propertySize || "N/A"}</span>
                </div>
              </div>
            </div>

            {/* Property Overview & Description Card with Gradient Border */}
            <div className="bg-gradient-to-r from-[#FC7A00]/40 via-amber-200/50 to-[#E06600]/40 p-[1.5px] rounded-3xl shadow-2xs">
              <div className="bg-white p-4.5 rounded-[22.5px] space-y-2">
                <h4 className="font-black text-xs text-black uppercase tracking-wider flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[18px]">description</span>
                  <span>Property Overview</span>
                </h4>
                <p className="text-xs text-gray-700 leading-relaxed font-medium whitespace-pre-line">
                  {property.description}
                </p>
              </div>
            </div>

            {/* Amenities & Facilities Card with Gradient Border */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="bg-gradient-to-r from-[#FC7A00]/40 via-amber-200/50 to-[#E06600]/40 p-[1.5px] rounded-3xl shadow-2xs">
                <div className="bg-white p-4.5 rounded-[22.5px] space-y-2.5">
                  <h4 className="font-black text-xs text-black uppercase tracking-wider flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#FC7A00] text-[18px]">verified</span>
                    <span>Amenities & Facilities</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {property.amenities.map((am, i) => (
                      <span
                        key={i}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-50 border border-[#FC7A00]/25 text-[11px] font-extrabold text-[#FC7A00]"
                      >
                        ✓ {am}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Property Location & Area Card with Mobile-Friendly Design */}
            <div className="bg-gradient-to-r from-[#FC7A00]/40 via-amber-200/50 to-[#E06600]/40 p-[1.5px] rounded-3xl shadow-2xs">
              <div className="bg-white p-4.5 rounded-[22.5px] space-y-3.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00]">
                      <span className="material-symbols-outlined text-[20px]">location_on</span>
                    </div>
                    <div>
                      <h4 className="font-black text-xs text-black uppercase tracking-wider">
                        Property Location & Area
                      </h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">
                        Exact Address & Neighborhood
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (fullLocationString) {
                          navigator.clipboard.writeText(fullLocationString);
                          toast.success("Property address copied!");
                        }
                      }}
                      className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[10px] uppercase rounded-xl cursor-pointer border-0 flex items-center gap-1 transition-all active:scale-95"
                      title="Copy Address"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                      <span className="hidden sm:inline">Copy</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenGoogleMaps}
                      className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-[10px] uppercase rounded-xl cursor-pointer border-0 flex items-center gap-1 shadow-2xs transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[14px]">map</span>
                      <span>Open Maps</span>
                    </button>
                  </div>
                </div>

                {/* Clean, Mobile-Optimized Location Layout */}
                <div className="p-4 bg-orange-50/40 rounded-2xl border border-orange-100/70 space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[#FC7A00] text-[18px] mt-0.5 flex-shrink-0">
                      pin_drop
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider mb-0.5">
                        Street Address
                      </span>
                      <p className="font-extrabold text-gray-900 leading-snug break-words">
                        {property.location?.address || "Address details on request"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-orange-200/40 flex items-center gap-2 flex-wrap">
                    {property.location?.city && (
                      <span className="px-3 py-1 rounded-xl bg-white border border-orange-200/80 text-[10.5px] font-extrabold text-gray-800 flex items-center gap-1 shadow-2xs">
                        <span className="material-symbols-outlined text-[13px] text-[#FC7A00]">location_city</span>
                        <span>{property.location.city}</span>
                      </span>
                    )}
                    {property.location?.state && (
                      <span className="px-3 py-1 rounded-xl bg-white border border-orange-200/80 text-[10.5px] font-extrabold text-[#FC7A00] flex items-center gap-1 shadow-2xs">
                        <span className="material-symbols-outlined text-[13px]">map</span>
                        <span>{property.location.state}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Published By Agent Card with Gradient Border (Moved to bottom) */}
            <div className="bg-gradient-to-r from-[#FC7A00]/40 via-amber-200/50 to-[#E06600]/40 p-[1.5px] rounded-3xl shadow-2xs">
              <div className="bg-white p-4.5 rounded-[22.5px] space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">account_circle</span>
                    <h4 className="font-black text-xs text-black uppercase tracking-wider">
                      Published By Agent
                    </h4>
                  </div>
                  {onInspectAgent && (
                    <button
                      type="button"
                      onClick={onInspectAgent}
                      className="px-3 py-1 bg-[#FC7A00]/10 hover:bg-[#FC7A00]/20 text-[#FC7A00] font-black text-[10.5px] uppercase rounded-xl cursor-pointer border-0 transition-all"
                    >
                      View Profile
                    </button>
                  )}
                </div>

                {isLoadingPublisher ? (
                  <div className="p-4 bg-gray-50 rounded-2xl animate-pulse space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {(publisherAgent?.avatarUrl || property.sellerAvatarUrl) && !publisherAgent?.mutedFields?.includes("avatar") ? (
                        <div className="w-12 h-12 rounded-2xl overflow-hidden relative border border-gray-200 shadow-2xs flex-shrink-0">
                          <Image src={publisherAgent?.avatarUrl || property.sellerAvatarUrl || ""} alt="Agent" fill className="object-cover" unoptimized />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FC7A00] to-[#E06600] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                          <span className="material-symbols-outlined text-[28px] text-white">account_circle</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="font-extrabold text-sm text-black truncate">
                            {enableCalls
                              ? publisherAgent?.displayName || property.sellerName || publisherAgent?.agencyName || "Verified Property Partner"
                              : publisherAgent?.agencyName || "Verified Real Estate Agency"}
                          </h5>
                          {(publisherAgent?.isVerified || true) && (
                            <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Verified Agent
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-black text-[#FC7A00] uppercase tracking-wider truncate">
                          {publisherAgent?.agencyName || "Independent Property Partner"}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-150 text-xs space-y-2">
                      {enableCalls && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Phone</span>
                            <span className="font-mono font-extrabold text-black">
                              {publisherAgent?.mutedFields?.includes("phone")
                                ? "Contact via Direct Inquiry"
                                : publisherAgent?.phone || property.sellerPhone || "Contact via Inquiry"}
                            </span>
                          </div>
                          {!publisherAgent?.mutedFields?.includes("email") && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Email</span>
                              <span className="font-mono text-gray-700 truncate max-w-[180px]">
                                {publisherAgent?.email || property.sellerEmail || "agent@eglobal.pay"}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Office</span>
                        <span className="font-medium text-gray-700 truncate max-w-[180px]">
                          {publisherAgent?.mutedFields?.includes("address")
                            ? "Address available on request"
                            : publisherAgent?.address || "Location not provided"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Standard Bottom Spacer */}
            <div className="h-6 sm:h-10 flex-shrink-0" />
          </div>

          {/* Static Fixed Bottom Action Bar */}
          <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-2xl flex items-center gap-2.5">
            {enableCalls && agentPhone && (
              <>
                <a
                  href={`tel:${agentPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.open(`tel:${agentPhone}`, "_system");
                    }
                  }}
                  className="w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer border-0 transition-all active:scale-90 flex-shrink-0 shadow-xs"
                  title="Call Agent"
                >
                  <span className="material-symbols-outlined text-[20px]">call</span>
                </a>
                <a
                  href={`https://wa.me/${agentPhone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-12 h-12 rounded-2xl bg-black hover:bg-gray-900 text-white flex items-center justify-center cursor-pointer border-0 transition-all active:scale-90 flex-shrink-0 shadow-xs"
                  title="WhatsApp Agent"
                >
                  <span className="material-symbols-outlined text-[20px]">chat</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={handleOpenChat}
              className={`flex-1 py-3.5 px-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0 shadow-md flex items-center justify-center gap-2 relative overflow-hidden ${
                enableChat
                  ? "bg-gradient-to-r from-[#FC7A00] via-amber-500 to-[#E06600] text-white hover:brightness-105 active:scale-95"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {enableChat ? "forum" : "chat_error"}
              </span>
              <span>{enableChat ? "Chat Agent" : "Chat Disabled"}</span>

              {enableChat && inquiryCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white text-[#FC7A00] font-black text-[10px] shadow-2xs">
                  {inquiryCount}
                </span>
              )}
            </button>
          </div>

          {/* Full-Screen Chat Inquiry Modal */}
          <EstateChatInquiryModal
            isOpen={isChatModalOpen}
            property={property}
            publisherAgent={publisherAgent}
            onClose={() => setIsChatModalOpen(false)}
            onSubmitInquiry={onSubmitInquiry}
          />

          {/* Fullscreen Image Zoom Overlay */}
          {fullscreenImageIndex !== null && images[fullscreenImageIndex] && (
            <div
              className="fixed inset-0 z-[100010] bg-black/95 flex flex-col justify-between p-4"
              onClick={() => setFullscreenImageIndex(null)}
            >
              <div className="flex items-center justify-between text-white pt-2 px-2">
                <span className="text-xs font-black uppercase">
                  Image {fullscreenImageIndex + 1} of {images.length}
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenImageIndex(null)}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white border-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>

              <div className="relative w-full h-[75vh] flex items-center justify-center">
                <Image
                  src={images[fullscreenImageIndex]}
                  alt="Zoomed View"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>

              <div className="flex justify-center gap-4 pb-4">
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenImageIndex(idx);
                        }}
                        className={`w-12 h-12 rounded-lg border-2 overflow-hidden flex-shrink-0 relative cursor-pointer ${
                          fullscreenImageIndex === idx ? "border-[#FC7A00]" : "border-transparent opacity-50"
                        }`}
                      >
                        <Image src={img} alt="Thumb" fill className="object-cover" unoptimized />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
