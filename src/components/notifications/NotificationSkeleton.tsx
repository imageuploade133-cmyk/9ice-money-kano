"use client";

import React from "react";

export function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl border border-gray-100 bg-white flex gap-4 animate-pulse"
        >
          <div className="w-11 h-11 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-grow space-y-2">
            <div className="h-4 bg-gray-100 rounded w-1/3" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
