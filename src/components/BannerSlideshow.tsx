"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/ConfigContext";

interface BannerSlide {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  targetPage: "all" | "bills" | "investment" | "referral" | "transfer" | "store" | "estate";
  link?: string;
  customWidth?: number | null;
  customHeight?: number | null;
  mobileHeight?: number | null;
  desktopHeight?: number | null;
  marginBottom?: number | null;
  isCrop?: boolean;
  isHidden?: boolean;
}

interface BannerSlideshowProps {
  page: "bills" | "investment" | "referral" | "transfer" | "store" | "estate";
  isDark?: boolean;
  fallbackSlides?: BannerSlide[];
}

export default function BannerSlideshow({ page, isDark = false, fallbackSlides = [] }: BannerSlideshowProps) {
  const [slides, setSlides] = useState<BannerSlide[]>(fallbackSlides);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);
  const { config } = useAppConfig();

  // Settings from ConfigContext (with safe defaults)
  const overlayFadeEnabled = config.bannerOverlayFadeEnabled !== false;
  const slideIntervalMs = (config.bannerSlideIntervalSeconds || 5) * 1000;
  const borderEnabled = config.bannerBorderEnabled !== false;
  const borderColor = config.bannerBorderColor || (isDark ? "#1f2937" : "#e5e7eb");
  const backgroundColor = config.bannerBackgroundColor || "#111827";
  const imageMode = config.bannerImageMode || "cover";
  const slideEffect = config.bannerSlideEffect || "fade";
  const imagePosition = config.bannerImagePosition || "center";
  const heightMobile = config.bannerHeightMobile || 150;
  const heightDesktop = config.bannerHeightDesktop || 220;
  const showIndicators = config.bannerShowIndicators !== false;

  useEffect(() => {
    let isMounted = true;
    const fetchSlides = async () => {
      try {
        const res = await fetch(`/api/banners?page=${page}`);
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.banners) && data.banners.length > 0) {
          if (isMounted) setSlides(data.banners);
        } else if (fallbackSlides.length > 0 && isMounted) {
          setSlides(fallbackSlides);
        }
      } catch (err) {
        console.error("Failed to load banner slideshow slides:", err);
        if (fallbackSlides.length > 0 && isMounted) setSlides(fallbackSlides);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSlides();

    return () => {
      isMounted = false;
    };
  }, [page]);

  // Sync fallback slides if available and primary fetch returned empty
  useEffect(() => {
    if (slides.length === 0 && fallbackSlides.length > 0) {
      setSlides(fallbackSlides);
    }
  }, [fallbackSlides]);

  // Autoplay loop Setup
  useEffect(() => {
    if (slides.length <= 1) return;

    const startAutoplay = () => {
      autoplayRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      }, slideIntervalMs);
    };

    startAutoplay();

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current);
      }
    };
  }, [slides, slideIntervalMs]);

  const handleDotClick = (idx: number) => {
    setCurrentIndex(idx);
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
    }
  };

  const handleSlideClick = (slide: BannerSlide) => {
    if (slide.link) {
      if (slide.link.startsWith("http")) {
        window.open(slide.link, "_blank", "noopener,noreferrer");
      } else {
        router.push(slide.link);
      }
    }
  };

  if (loading && slides.length === 0) {
    return null;
  }

  if (slides.length === 0) {
    return null;
  }

  const activeSlide = slides[currentIndex] || slides[0];

  const borderStyles = borderEnabled
    ? { border: `1px solid ${borderColor}` }
    : { border: "none" };

  const effectiveHeightMobile = activeSlide.mobileHeight || activeSlide.customHeight || heightMobile;
  const effectiveHeightDesktop = activeSlide.desktopHeight || activeSlide.customHeight || heightDesktop;
  const effectiveWidth = activeSlide.customWidth ? `${activeSlide.customWidth}px` : "100%";
  const effectiveMarginBottom = activeSlide.marginBottom !== undefined && activeSlide.marginBottom !== null
    ? activeSlide.marginBottom
    : (config.bannerMarginBottom !== undefined ? config.bannerMarginBottom : 20);
  const isSlideCrop = activeSlide.isCrop !== false;

  const slideVariants = {
    initial: (effect: string) => ({
      opacity: 0,
      x: effect === "slide" ? "100%" : 0,
      scale: effect === "slide" ? 1 : 0.98,
    }),
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (effect: string) => ({
      opacity: 0,
      x: effect === "slide" ? "-100%" : 0,
      scale: effect === "slide" ? 1 : 1.02,
    }),
  };

  return (
    <div
      className="relative select-none overflow-hidden rounded-2xl md:rounded-[24px] shadow-xs mx-auto"
      style={{
        backgroundColor: backgroundColor,
        ...borderStyles,
        height: `${effectiveHeightMobile}px`,
        width: effectiveWidth,
        maxWidth: "100%",
        marginBottom: `${effectiveMarginBottom}px`,
      }}
    >
      <style jsx global>{`
        @media (min-width: 768px) {
          .banner-slideshow-container {
            height: ${effectiveHeightDesktop}px !important;
          }
        }
      `}</style>

      <div className="banner-slideshow-container w-full h-full relative overflow-hidden rounded-2xl md:rounded-[24px]">
        <AnimatePresence initial={false} custom={slideEffect}>
          <motion.div
            key={currentIndex}
            custom={slideEffect}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={() => handleSlideClick(activeSlide)}
            className="absolute inset-0 w-full h-full flex items-center cursor-pointer group overflow-hidden rounded-2xl md:rounded-[24px]"
          >
            <img
              src={activeSlide.imageUrl}
              alt={activeSlide.title || "Marketing Campaign"}
              className={cn(
                "absolute inset-0 w-full h-full transition-transform duration-[6s]",
                (!isSlideCrop || imageMode === "contain") ? "object-contain" : "object-cover group-hover:scale-105"
              )}
              style={{
                objectPosition: imagePosition,
              }}
            />

            {overlayFadeEnabled && (
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent flex flex-col justify-center p-6 md:p-10 text-left" />
            )}

            <div className="relative z-10 max-w-[70%] space-y-1.5 md:space-y-2 select-text cursor-default pl-6 md:pl-10">
              {activeSlide.title && (
                <motion.h3
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="font-hanken font-black text-sm min-[360px]:text-base md:text-xl text-white uppercase tracking-tight leading-tight select-none pointer-events-none"
                >
                  {activeSlide.title}
                </motion.h3>
              )}
              {activeSlide.description && (
                <motion.p
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="font-hanken text-[10px] min-[360px]:text-xs md:text-sm text-gray-200/90 font-semibold leading-snug select-none pointer-events-none"
                >
                  {activeSlide.description}
                </motion.p>
              )}

              {activeSlide.link && (
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="pt-1 select-none pointer-events-none"
                >
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-[9px] min-[360px]:text-[10px] uppercase rounded-full shadow-lg shadow-orange-500/10 active:scale-95 transition-all">
                    <span>Learn More</span>
                    <span className="material-symbols-outlined text-[11px] font-bold">arrow_forward</span>
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && showIndicators && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-1.5 bg-black/35 backdrop-blur-xs rounded-full">
          {slides.map((_, idx) => {
            const isSelected = currentIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                  isSelected ? "w-4 bg-[#FC7A00]" : "w-1.5 bg-white/50 hover:bg-white"
                )}
                aria-label={`Go to slide ${idx + 1}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
