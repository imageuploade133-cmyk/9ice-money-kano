"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { NotificationItem, Notification } from "@/components/notifications/NotificationItem";
import { NotificationDetailModal } from "@/components/notifications/NotificationDetailModal";
import { NotificationSkeleton } from "@/components/notifications/NotificationSkeleton";
import { NotificationEmptyState } from "@/components/notifications/NotificationEmptyState";

export type { Notification };

interface NotificationTrayProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
  onToggleRead: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

export const NotificationTray: React.FC<NotificationTrayProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onDeleteNotification,
  onToggleRead,
  onLoadMore,
  hasMore,
}) => {
  const [trayLoading, setTrayLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [isPageLoadingMore, setIsPageLoadingMore] = useState(false);

  // Back button & history stack handler for main Notification Tray
  useModalBackHandler(isOpen, onClose, "notification-tray");

  // Show tray content immediately when opened
  useEffect(() => {
    if (isOpen) {
      setTrayLoading(false);
    }
  }, [isOpen]);

  // Turn off page loading spinner when notifications list size changes
  useEffect(() => {
    setIsPageLoadingMore(false);
  }, [notifications.length]);

  // Trigger sub-drawer for notification details
  const handleNotificationClick = (n: Notification) => {
    onToggleRead(n.id);
    setSelectedNotification(n);
  };

  // Unified handler to invoke onLoadMore smoothly
  const handleLoadMoreTrigger = () => {
    if (hasMore && !isPageLoadingMore) {
      setIsPageLoadingMore(true);
      onLoadMore();
    }
  };

  // Scroll detection logic to trigger next page load near bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 10; // pixels from the bottom
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight <= threshold;
    if (isNearBottom) {
      handleLoadMoreTrigger();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
          className="fixed inset-0 w-full h-full bg-white z-[10000] flex flex-col"
        >
          {/* Top Sticky App Header */}
          <div className="safe-top px-margin-mobile py-4 border-b border-gray-100 flex justify-between items-center bg-white">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] font-bold">arrow_back</span>
            </button>
            <div className="text-center">
              <h2 className="font-hanken font-bold text-lg text-black">
                Notifications
              </h2>
            </div>
            {notifications.length > 0 && !trayLoading ? (
              <button
                onClick={onMarkAllRead}
                className="text-[12px] font-bold text-[#FC7A00] uppercase tracking-wider hover:brightness-110 cursor-pointer"
              >
                Clear All
              </button>
            ) : (
              <div className="w-10" />
            )}
          </div>

          {/* Scrollable Notifications Area */}
          <div
            onScroll={handleScroll}
            className="flex-grow overflow-y-auto p-margin-mobile space-y-4 custom-scrollbar bg-gray-50/50"
          >
            {trayLoading ? (
              <NotificationSkeleton />
            ) : notifications.length === 0 ? (
              <NotificationEmptyState />
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={handleNotificationClick}
                    onDelete={onDeleteNotification}
                  />
                ))}

                {/* Highly intuitive pagination footer controls */}
                {hasMore && (
                  <div className="pt-4 pb-6 flex flex-col items-center justify-center">
                    {isPageLoadingMore ? (
                      <div className="flex items-center gap-2 text-[#FC7A00] font-medium text-sm">
                        <div className="w-4 h-4 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
                        <span>Loading more notifications...</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleLoadMoreTrigger}
                        className="px-6 py-2.5 rounded-full border border-[#FC7A00]/30 hover:border-[#FC7A00] bg-white text-[#FC7A00] text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">expand_more</span>
                        Load More
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 90% Height Bottom Detail Drawer Sheet */}
          <NotificationDetailModal
            notification={selectedNotification}
            onClose={() => setSelectedNotification(null)}
            onCloseParentTray={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
