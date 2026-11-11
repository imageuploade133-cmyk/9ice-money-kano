"use client";

import React from "react";
import { OrderRecord } from "./types";

interface StoreConfirmedOrderModalProps {
  confirmedOrder: OrderRecord | null;
  onClose: () => void;
}

export const StoreConfirmedOrderModal: React.FC<StoreConfirmedOrderModalProps> = ({
  confirmedOrder,
  onClose,
}) => {
  if (!confirmedOrder) return null;

  return (
    <div className="fixed inset-0 z-[100004] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-sm p-6 rounded-3xl bg-white text-black space-y-4 shadow-2xl text-center border-0">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
          <span className="material-symbols-outlined text-[36px]">check_circle</span>
        </div>

        <div>
          <h3 className="font-black text-base uppercase tracking-tight text-black">
            Order Placed Successfully!
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Order ID: <strong className="font-mono text-[#FC7A00]">{confirmedOrder.id}</strong>
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-gray-50 border-0 text-left text-xs space-y-1">
          <div className="flex justify-between font-bold">
            <span className="text-gray-500">Amount Charged:</span>
            <span className="text-emerald-600 font-black">
              ₦{confirmedOrder.totalAmount?.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Recipient:</span>
            <span className="font-bold">{confirmedOrder.customerName}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px]">Address:</span>
            <span className="font-medium text-[11px] line-clamp-2">
              {confirmedOrder.deliveryAddress}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-[#FC7A00] text-white rounded-xl font-black text-xs uppercase tracking-wider hover:opacity-90 border-0"
        >
          Close & View Store
        </button>
      </div>
    </div>
  );
};
