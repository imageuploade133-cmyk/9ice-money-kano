export interface StoreCategoryDoc {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  backupUrl?: string;
  iconName?: string;
  isHidden?: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STORE_CATEGORIES: StoreCategoryDoc[] = [
  {
    id: "cat_all",
    name: "ALL",
    slug: "all",
    description: "All products in store",
    iconName: "grid_view",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cat_electronics",
    name: "Electronics",
    slug: "electronics",
    description: "Consumer electronics and appliances",
    iconName: "devices",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cat_fashion",
    name: "Fashion",
    slug: "fashion",
    description: "Apparel, footwear and fashion accessories",
    iconName: "checkroom",
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cat_utilities",
    name: "Airtime & Utilities",
    slug: "airtime-utilities",
    description: "Bills payment, airtime and data bundles",
    iconName: "receipt_long",
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cat_giftcards",
    name: "Gift Cards",
    slug: "gift-cards",
    description: "Digital vouchers and gift cards",
    iconName: "card_giftcard",
    sortOrder: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "cat_gadgets",
    name: "Gadgets & Phones",
    slug: "gadgets-phones",
    description: "Smartphones, tablets and wearable tech",
    iconName: "smartphone",
    sortOrder: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
