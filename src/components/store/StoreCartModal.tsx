"use client";

import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { CartItem } from "./types";

interface StoreCartModalProps {
  isOpen: boolean;
  cart: CartItem[];
  totalCartItems: number;
  cartSubtotal: number;
  isCheckoutStep: boolean;
  selectedPaymentMethod: "WALLET_NGN" | "CARD_CHECKOUT";
  customerDeliveryName: string;
  customerDeliveryPhone: string;
  customerDeliveryAddress: string;
  isPlacingOrder: boolean;
  hideCardPayment?: boolean;
  enablePickup?: boolean;
  userBalance?: number;
  onClose: () => void;
  onUpdateCartQuantity: (productId: string, delta: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onSetSelectedPaymentMethod: (method: "WALLET_NGN" | "CARD_CHECKOUT") => void;
  onSetIsCheckoutStep: (isCheckout: boolean) => void;
  onSetCustomerDeliveryName: (val: string) => void;
  onSetCustomerDeliveryPhone: (val: string) => void;
  onSetCustomerDeliveryAddress: (val: string) => void;
  onConfirmCheckout: (e: React.FormEvent) => void;
}

export const StoreCartModal: React.FC<StoreCartModalProps> = ({
  isOpen,
  cart,
  totalCartItems,
  cartSubtotal,
  isCheckoutStep,
  selectedPaymentMethod,
  customerDeliveryName,
  customerDeliveryPhone,
  customerDeliveryAddress,
  isPlacingOrder,
  hideCardPayment,
  enablePickup,
  userBalance,
  onClose,
  onUpdateCartQuantity,
  onRemoveFromCart,
  onClearCart,
  onSetSelectedPaymentMethod,
  onSetIsCheckoutStep,
  onSetCustomerDeliveryName,
  onSetCustomerDeliveryPhone,
  onSetCustomerDeliveryAddress,
  onConfirmCheckout,
}) => {
  const [deliveryType, setDeliveryType] = React.useState<"DELIVERY" | "PICKUP">("DELIVERY");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100002] bg-white flex flex-col justify-between overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 350 }}
            className="w-full h-full flex flex-col text-black max-w-md mx-auto overflow-hidden will-change-transform"
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 transition-colors cursor-pointer border-0"
                  title="Back"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">
                  shopping_bag
                </span>
                <div>
                  <h2 className="font-hanken font-extrabold text-base text-black uppercase tracking-wide">
                    Cart
                  </h2>
                  <p className="font-hanken text-[9.5px] text-gray-400 font-bold uppercase tracking-widest">
                    {totalCartItems} {totalCartItems === 1 ? "Item" : "Items"} Selected
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Cart Drawer Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 custom-scrollbar pb-16">
              {cart.length === 0 ? (
                <div className="py-20 flex flex-col items-center text-center space-y-3">
                  <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[48px] text-gray-300">
                      remove_shopping_cart
                    </span>
                  </div>
                  <h3 className="font-bodoni font-bold text-lg text-black">Your Cart is Empty</h3>
                  <p className="font-hanken text-xs text-gray-400 max-w-xs leading-relaxed">
                    Explore storefront hardware and gear to add items to your cart.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 px-6 py-3 bg-[#FC7A00] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-xs border-0"
                  >
                    Browse Products
                  </button>
                </div>
              ) : (
                cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="p-4 bg-gray-50 border-0 rounded-2xl flex items-center justify-between gap-3 shadow-3xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-14 h-14 rounded-xl border-0 bg-white overflow-hidden relative flex-shrink-0">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[28px] text-gray-400 p-2">
                            storefront
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-xs uppercase text-black truncate">
                          {product.title}
                        </h4>
                        <p className="font-mono font-bold text-xs text-[#FC7A00] mt-0.5">
                          ₦{product.price.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateCartQuantity(product.id, -1)}
                        className="w-8 h-8 rounded-lg border-0 bg-white text-xs font-bold flex items-center justify-center active:scale-90 cursor-pointer shadow-3xs"
                      >
                        -
                      </button>
                      <span className="font-mono font-black text-xs w-4 text-center">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQuantity(product.id, 1)}
                        className="w-8 h-8 rounded-lg border-0 bg-white text-xs font-bold flex items-center justify-center active:scale-90 cursor-pointer shadow-3xs"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(product.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors ml-1 cursor-pointer border-0"
                        title="Remove item"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && !isCheckoutStep && (
              <div className="p-5 bg-white border-t border-gray-100 space-y-3 shadow-lg z-20 flex-shrink-0">
                {/* Payment Method Selector Bar directly in Cart */}
                <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-150">
                  <div className="flex items-center justify-between">
                    <label className="text-[9.5px] font-black uppercase text-gray-400 block">
                      Payment Method / Checkout Channel
                    </label>
                    {userBalance !== undefined && (
                      <span className="text-[9.5px] font-bold text-gray-500 font-mono">
                        Bal: ₦{userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  <div className={`grid ${hideCardPayment ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                    <button
                      type="button"
                      onClick={() => onSetSelectedPaymentMethod("WALLET_NGN")}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        selectedPaymentMethod === "WALLET_NGN"
                          ? "border-[#FC7A00] bg-orange-50/90 text-black font-extrabold shadow-3xs"
                          : "border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">
                          account_balance_wallet
                        </span>
                        <div className="min-w-0 flex flex-col">
                          <span className="text-[10px] uppercase truncate">Main Wallet</span>
                          {userBalance !== undefined && (
                            <span className="text-[8.5px] text-gray-400 font-mono font-semibold truncate">
                              ₦{userBalance.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedPaymentMethod === "WALLET_NGN" && (
                        <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">
                          check_circle
                        </span>
                      )}
                    </button>

                    {!hideCardPayment && (
                      <button
                        type="button"
                        onClick={() => onSetSelectedPaymentMethod("CARD_CHECKOUT")}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          selectedPaymentMethod === "CARD_CHECKOUT"
                            ? "border-emerald-500 bg-emerald-50/90 text-black font-extrabold shadow-3xs"
                            : "border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="material-symbols-outlined text-[18px] text-emerald-600">
                            credit_card
                          </span>
                          <div className="min-w-0 flex flex-col">
                            <span className="text-[10px] uppercase truncate">Pay with Card</span>
                            <span className="text-[8.5px] text-gray-400 font-semibold truncate">
                              Flutterwave
                            </span>
                          </div>
                        </div>
                        {selectedPaymentMethod === "CARD_CHECKOUT" && (
                          <span className="material-symbols-outlined text-[16px] text-emerald-600">
                            check_circle
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-gray-500 uppercase tracking-wider">
                    Subtotal ({totalCartItems} items)
                  </span>
                  <span className="font-mono text-lg font-black text-black">
                    ₦{cartSubtotal.toLocaleString()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onSetIsCheckoutStep(true)}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm border-0"
                >
                  <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                  <span>Proceed to Delivery & Payment</span>
                </button>

                <button
                  type="button"
                  onClick={onClearCart}
                  className="w-full text-center text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider cursor-pointer transition-colors border-0"
                >
                  Clear Shopping Cart
                </button>
              </div>
            )}

            {isCheckoutStep && (
              <div className="absolute inset-0 bg-white z-30 p-5 overflow-y-auto flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => onSetIsCheckoutStep(false)}
                      className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-black border-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                      Back to Cart
                    </button>
                    <span className="text-xs font-black uppercase text-[#FC7A00]">
                      Delivery & Payment Channel
                    </span>
                  </div>

                  <form
                    id="checkout-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!customerDeliveryName || !customerDeliveryName.trim()) {
                        toast.error("Please enter full recipient name.");
                        return;
                      }
                      if (!customerDeliveryPhone || !customerDeliveryPhone.trim()) {
                        toast.error("Please enter a valid delivery phone number.");
                        return;
                      }
                      if (!customerDeliveryAddress || !customerDeliveryAddress.trim()) {
                        toast.error(
                          deliveryType === "PICKUP"
                            ? "Please enter in-store pickup notes / contact person."
                            : "Please enter your full delivery address."
                        );
                        return;
                      }

                      if (deliveryType === "PICKUP" && !customerDeliveryAddress.toUpperCase().includes("PICKUP")) {
                        onSetCustomerDeliveryAddress(`[IN-STORE PICKUP] ${customerDeliveryAddress.trim()}`);
                      }
                      onConfirmCheckout(e);
                    }}
                    className="space-y-3.5 pb-20"
                  >
                    {/* Fulfillment Method Selector (Shown when enablePickup is ON) */}
                    {enablePickup && (
                      <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                        <label className="text-[10px] font-black uppercase text-gray-500 block">
                          Fulfillment / Delivery Option *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryType("DELIVERY");
                              if (customerDeliveryAddress.startsWith("[IN-STORE PICKUP] ")) {
                                onSetCustomerDeliveryAddress(customerDeliveryAddress.replace("[IN-STORE PICKUP] ", ""));
                              }
                            }}
                            className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              deliveryType === "DELIVERY"
                                ? "border-[#FC7A00] bg-orange-50/80 shadow-xs"
                                : "border-gray-200 bg-white hover:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">
                                local_shipping
                              </span>
                              {deliveryType === "DELIVERY" && (
                                <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">
                                  check_circle
                                </span>
                              )}
                            </div>
                            <div className="mt-2">
                              <span className="font-extrabold text-[11px] uppercase block text-black">
                                Home Delivery
                              </span>
                              <span className="text-[9px] text-gray-400 font-semibold block">
                                Deliver to address
                              </span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryType("PICKUP");
                            }}
                            className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              deliveryType === "PICKUP"
                                ? "border-emerald-500 bg-emerald-50/80 shadow-xs"
                                : "border-gray-200 bg-white hover:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="material-symbols-outlined text-[20px] text-emerald-600">
                                storefront
                              </span>
                              {deliveryType === "PICKUP" && (
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                  check_circle
                                </span>
                              )}
                            </div>
                            <div className="mt-2">
                              <span className="font-extrabold text-[11px] uppercase block text-black">
                                In-Store Pickup
                              </span>
                              <span className="text-[9px] text-gray-400 font-semibold block">
                                Collect at physical store
                              </span>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Prominent Payment Method Selector at Top of Checkout Form */}
                    <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase text-gray-500 block">
                          Select Payment Method *
                        </label>
                        {userBalance !== undefined && (
                          <span className="text-[9.5px] font-bold text-gray-500 font-mono">
                            Available: ₦{userBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>

                      <div className={`grid ${hideCardPayment ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                        <button
                          type="button"
                          onClick={() => onSetSelectedPaymentMethod("WALLET_NGN")}
                          className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                            selectedPaymentMethod === "WALLET_NGN"
                              ? "border-[#FC7A00] bg-orange-50/80 shadow-xs"
                              : "border-gray-200 bg-white hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">
                              account_balance_wallet
                            </span>
                            {selectedPaymentMethod === "WALLET_NGN" && (
                              <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">
                                check_circle
                              </span>
                            )}
                          </div>
                          <div className="mt-2">
                            <span className="font-extrabold text-[11px] uppercase block text-black">
                              Main Wallet
                            </span>
                            <span className="text-[9px] text-gray-400 font-semibold block">
                              {userBalance !== undefined
                                ? `Balance: ₦${userBalance.toLocaleString()}`
                                : "Deduct from NGN balance"}
                            </span>
                          </div>
                        </button>

                        {!hideCardPayment && (
                          <button
                            type="button"
                            onClick={() => onSetSelectedPaymentMethod("CARD_CHECKOUT")}
                            className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                              selectedPaymentMethod === "CARD_CHECKOUT"
                                ? "border-emerald-500 bg-emerald-50/80 shadow-xs"
                                : "border-gray-200 bg-white hover:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="material-symbols-outlined text-[20px] text-emerald-600">
                                credit_card
                              </span>
                              {selectedPaymentMethod === "CARD_CHECKOUT" && (
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                  check_circle
                                </span>
                              )}
                            </div>
                            <div className="mt-2">
                              <span className="font-extrabold text-[11px] uppercase block text-black">
                                Pay with Card
                              </span>
                              <span className="text-[9px] text-gray-400 font-semibold block">
                                Direct Card Checkout
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                        Full Recipient Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerDeliveryName}
                        onChange={(e) => onSetCustomerDeliveryName(e.target.value)}
                        placeholder="e.g. Captain Jules"
                        className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                        Phone Number for Delivery Updates *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerDeliveryPhone}
                        onChange={(e) => onSetCustomerDeliveryPhone(e.target.value)}
                        placeholder="e.g. 08012345678"
                        className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                        {deliveryType === "PICKUP"
                          ? "In-Store Pickup Person & Notes *"
                          : "Full Delivery Address *"}
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={customerDeliveryAddress}
                        onChange={(e) => onSetCustomerDeliveryAddress(e.target.value)}
                        placeholder={
                          deliveryType === "PICKUP"
                            ? "e.g. Person picking up: Abdulkadir Shaba (Phone: 08012345678)"
                            : "e.g. Suite 4B, E-Tech Hub Plaza, Victoria Island, Lagos"
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00] resize-none"
                      />
                    </div>

                    <div className="p-3.5 rounded-2xl bg-gray-50 border-0 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                        <span>Selected Channel:</span>
                        <span className="text-emerald-600 font-black">
                          {selectedPaymentMethod === "CARD_CHECKOUT"
                            ? "Checkout with Card Payment"
                            : "Main NGN Wallet"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-black">
                        <span className="text-gray-600">Total Order Charge:</span>
                        <span className="text-[#FC7A00] text-sm">
                          ₦{cartSubtotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="pt-4 border-0 space-y-2">
                  <button
                    type="submit"
                    form="checkout-form"
                    disabled={isPlacingOrder}
                    className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 border-0"
                  >
                    {isPlacingOrder ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                    )}
                    <span>Confirm Order & Pay ₦{cartSubtotal.toLocaleString()}</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
