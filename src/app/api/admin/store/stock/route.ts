import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.view");
    if (!perm.authorized) {
      return perm.response!;
    }

    const docSnap = await adminDb.collection("config").doc("store_data").get();
    const data = docSnap.exists ? docSnap.data() || {} : {};
    const items: any[] = Array.isArray(data.items) ? data.items : [];

    const totalProducts = items.length;
    let availableStockUnits = 0;
    let unlimitedCount = 0;
    let totalCostValue = 0;
    let potentialRevenue = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    const enrichedItems = items.map((item) => {
      const cost = typeof item.costPrice === "number" ? item.costPrice : (Number(item.costPrice) || 0);
      const selling = typeof item.discountPrice === "number" && item.discountPrice > 0
        ? item.discountPrice
        : (typeof item.price === "number" ? item.price : Number(item.price) || 0);

      const qty = item.unlimitedStock ? null : (typeof item.stockQuantity === "number" ? item.stockQuantity : (Number(item.stockQuantity) || 0));
      const isOut = !item.inStock || (!item.unlimitedStock && (qty === null || qty <= 0));
      const isLow = !item.unlimitedStock && qty !== null && qty > 0 && qty <= 5;

      if (item.unlimitedStock) {
        unlimitedCount++;
      } else if (qty !== null && qty > 0) {
        availableStockUnits += qty;
        totalCostValue += cost * qty;
        potentialRevenue += selling * qty;
      }

      if (isOut) outOfStockCount++;
      if (isLow) lowStockCount++;

      const unitProfit = selling - cost;
      const totalEstimatedProfit = item.unlimitedStock ? null : (qty !== null && qty > 0 ? unitProfit * qty : 0);

      return {
        ...item,
        resolvedCostPrice: cost,
        resolvedSellingPrice: selling,
        unitProfit,
        totalEstimatedProfit,
        isOut,
        isLow,
      };
    });

    const potentialProfit = potentialRevenue - totalCostValue;

    return NextResponse.json({
      success: true,
      summary: {
        totalProducts,
        availableStockUnits,
        unlimitedCount,
        totalCostValue,
        potentialRevenue,
        potentialProfit,
        outOfStockCount,
        lowStockCount,
      },
      items: enrichedItems,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Stock GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to compute stock analytics", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { itemId, stockQuantity, unlimitedStock, inStock, costPrice, price, discountPrice } = body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required for stock updates." }, { status: 400 });
    }

    const docRef = adminDb.collection("config").doc("store_data");
    const docSnap = await docRef.get();
    const existingData = docSnap.exists ? docSnap.data() || {} : {};
    let items = Array.isArray(existingData.items) ? [...existingData.items] : [];

    const now = new Date().toISOString();
    let updated = false;

    items = items.map((i) => {
      if (i.id === itemId) {
        updated = true;
        const newQty = unlimitedStock ? null : (typeof stockQuantity === "number" ? stockQuantity : Number(stockQuantity) || 0);
        return {
          ...i,
          costPrice: costPrice !== undefined ? (costPrice !== null ? Number(costPrice) : null) : i.costPrice,
          price: price !== undefined ? Number(price) : i.price,
          discountPrice: discountPrice !== undefined ? (discountPrice !== null ? Number(discountPrice) : null) : i.discountPrice,
          stockQuantity: newQty,
          unlimitedStock: unlimitedStock !== undefined ? Boolean(unlimitedStock) : i.unlimitedStock,
          inStock: inStock !== undefined ? Boolean(inStock) : (unlimitedStock ? true : newQty !== null && newQty > 0),
          updatedAt: now,
        };
      }
      return i;
    });

    if (!updated) {
      return NextResponse.json({ error: "Item not found in store directory." }, { status: 404 });
    }

    await docRef.set({ items, updatedAt: now }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Stock level updated successfully!",
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Stock POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update stock levels", details: error.message }, { status: 500 });
  }
}
