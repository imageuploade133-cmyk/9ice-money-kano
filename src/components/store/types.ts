import {
  StoreItem,
  StoreSlide,
  StoreCategory,
  StoreSettings,
  CartItem,
} from "@/lib/store-cache";

export type { StoreItem, StoreSlide, StoreCategory, StoreSettings, CartItem };

export interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  category?: string;
}

export interface OrderRecord {
  id: string;
  items: OrderItem[];
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryType?: "DELIVERY" | "PICKUP";
  paymentMethod: "WALLET_NGN" | "CARD_CHECKOUT";
  status: string;
  createdAt: string;
  adminNotes?: string;
}

// Convert hex color + opacity fraction (0 to 1) to rgba string strictly for product borders
export const hexToRgba = (hex: string = "#FC7A00", opacity: number = 1): string => {
  let c = hex.trim().replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((x) => x + x).join("");
  }
  if (c.length !== 6) return `rgba(252, 122, 0, ${opacity})`;
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Helper to resolve effective promo selling price
export const getEffectivePrice = (item: StoreItem): number => {
  const promo = item.discountPrice || item.promoPrice;
  if (typeof promo === "number" && promo > 0 && promo < item.price) {
    return promo;
  }
  return item.price;
};
