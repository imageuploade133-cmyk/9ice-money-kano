"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { EstateSlide } from "@/app/api/estate/slides/route";

export function EstateBannerSlideshow() {
  const [slides, setSlides] = useState<EstateSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/estate/slides")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.slides) && data.slides.length > 0) {
          setSlides(data.slides);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (isLoading) return null;
  if (slides.length === 0) return null;

  const currentSlide = slides[activeSlideIndex];

  return (
    <div className="w-full mb-5 relative">
      <div className="relative w-full h-40 min-[375px]:h-44 sm:h-52 rounded-3xl overflow-hidden border border-gray-150 shadow-xs bg-black">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide.id}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full"
          >
            <Image
              src={currentSlide.imageUrl}
              alt={currentSlide.title || "Estate Banner"}
              fill
              className="object-cover"
              unoptimized
            />
            {/* Dark gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

            <div className="absolute bottom-3.5 left-4 right-4 text-white space-y-1 z-10">
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#FC7A00] text-white shadow-2xs inline-block">
                {currentSlide.badgeText || "Featured Deals"}
              </span>

              {currentSlide.title && (
                <h3 className="font-bodoni font-bold text-sm min-[375px]:text-base sm:text-lg leading-tight truncate">
                  {currentSlide.title}
                </h3>
              )}

              {currentSlide.subtitle && (
                <p className="font-hanken text-[10.5px] text-gray-200 font-medium truncate">
                  {currentSlide.subtitle}
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slide Indicators */}
        {slides.length > 1 && (
          <div className="absolute top-3 right-3 flex items-center gap-1 z-20 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlideIndex(idx)}
                className={`h-1.5 rounded-full transition-all border-0 cursor-pointer ${
                  activeSlideIndex === idx ? "bg-[#FC7A00] w-4" : "bg-white/60 w-1.5"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
