"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Global scroll restoration hook that preserves the exact scroll position per route
 * when navigating back in history, preventing unwanted browser auto-scroll or reset to top.
 */
export function useScrollRestoration() {
  const pathname = usePathname();
  const isPopStateRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Disable browser default auto-scroll restoration on popstate
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // 2. Detect back/forward browser history navigation
    const handlePopState = () => {
      isPopStateRef.current = true;
    };

    // 3. Persist current scroll position in sessionStorage whenever user scrolls
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (pathname && !isPopStateRef.current) {
          sessionStorage.setItem(`scroll_pos_${pathname}`, window.scrollY.toString());
        }
      });
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [pathname]);

  // 4. Restore exact saved scroll position when returning to a page
  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    const savedPos = sessionStorage.getItem(`scroll_pos_${pathname}`);

    if (savedPos !== null) {
      const targetY = parseInt(savedPos, 10);
      if (!isNaN(targetY) && targetY >= 0) {
        // Double requestAnimationFrame ensures Next.js layout DOM is rendered before setting scroll
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: targetY, behavior: "instant" });
          });
        });
      }
    }

    isPopStateRef.current = false;
  }, [pathname]);
}
