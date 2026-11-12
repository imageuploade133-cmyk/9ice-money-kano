"use client";

import React from "react";

export function NotificationEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
        <span className="material-symbols-outlined text-[36px]">
          notifications_off
        </span>
      </div>
      <h3 className="font-hanken font-bold text-lg text-black mb-1">All Caught Up!</h3>
      <p className="text-gray-400 text-sm max-w-[240px]">
        You have cleared all alerts and messages in your secure inbox.
      </p>
    </div>
  );
}
