"use client";

import { useEffect, useRef } from "react";

// Global stack to track open modal instances in order of appearance
const modalStack: string[] = [];
let originalBodyOverflow: string | null = null;
let originalBodyPosition: string | null = null;
let originalBodyWidth: string | null = null;

let isProgrammaticBack = false;
let programmaticBackTimer: NodeJS.Timeout | null = null;

/**
 * Custom React hook for robust Modal & Drawer UX:
 * 1. Locks background body scrolling on all devices when active and preserves lock until all stacked modals close.
 * 2. Intercepts hardware / browser Back button (`popstate`) on mobile & desktop to close strictly the top-most active modal.
 * 3. Handles nested/stacked modals safely so closing a child modal (programmatically or via back button) does not disturb parent modals.
 *
 * @param isOpen Boolean indicating if the modal/drawer is open.
 * @param onClose Callback to close the modal when Back button is pressed or requested.
 * @param modalId Optional unique identifier for modal history state management.
 */
export function useModalBackHandler(
  isOpen: boolean,
  onClose: () => void,
  modalId: string = "modal-drawer"
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    // 1. Lock Background Body Scrolling (Preserves lock across nested modals)
    if (modalStack.length === 0) {
      originalBodyOverflow = document.body.style.overflow;
      originalBodyPosition = document.body.style.position;
      originalBodyWidth = document.body.style.width;
      document.body.style.overflow = "hidden";
    }

    // 2. Register State Key & Push to Global Stack
    const stateKey = `modal_${modalId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    modalStack.push(stateKey);

    let isPoppedByBackButton = false;

    window.history.pushState({ modalStateKey: stateKey }, "", window.location.href);

    // 3. Handle PopState (Back Button Interception)
    const handlePopState = (event: PopStateEvent) => {
      if (isProgrammaticBack) {
        isProgrammaticBack = false;
        if (programmaticBackTimer) {
          clearTimeout(programmaticBackTimer);
          programmaticBackTimer = null;
        }
        return;
      }

      // Strictly enforce that ONLY the top-most modal in the stack handles this back action
      const topStateKey = modalStack[modalStack.length - 1];
      if (topStateKey === stateKey) {
        isPoppedByBackButton = true;
        modalStack.pop();

        if (onCloseRef.current) {
          onCloseRef.current();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);

      // Remove from global stack if unmounted programmatically
      const stackIdx = modalStack.indexOf(stateKey);
      if (stackIdx !== -1) {
        modalStack.splice(stackIdx, 1);
      }

      // Restore body scrolling only if no modals remain open
      if (modalStack.length === 0) {
        document.body.style.overflow = originalBodyOverflow || "";
        document.body.style.position = originalBodyPosition || "";
        document.body.style.width = originalBodyWidth || "";
      }

      // Clean history state if closing programmatically rather than via back button
      if (!isPoppedByBackButton && window.history.state && window.history.state.modalStateKey === stateKey) {
        isProgrammaticBack = true;
        window.history.back();

        if (programmaticBackTimer) clearTimeout(programmaticBackTimer);
        programmaticBackTimer = setTimeout(() => {
          isProgrammaticBack = false;
        }, 120);
      }
    };
  }, [isOpen, modalId]);
}
