import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export interface TierLevelItem {
  id: string;
  name: string;
  dailyLimit: number;
  singleLimit: number;
  maxBalance: number;
  description?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_TIER_LEVELS: TierLevelItem[] = [
  {
    id: "tier_1",
    name: "Tier 1",
    dailyLimit: 500000,
    singleLimit: 200000,
    maxBalance: 300000,
    description: "Basic Account Tier for new users",
    isDefault: true,
  },
  {
    id: "tier_2",
    name: "Tier 2",
    dailyLimit: 5000000,
    singleLimit: 2000000,
    maxBalance: 5000000,
    description: "Verified Account Tier for identity-verified users",
    isDefault: true,
  },
  {
    id: "tier_3",
    name: "Tier 3",
    dailyLimit: 50000000,
    singleLimit: 10000000,
    maxBalance: 50000000,
    description: "Premium Account Tier for high-volume users",
    isDefault: true,
  },
];

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (perm.auth?.uid === "mock-admin-uid") {
      return NextResponse.json({
        success: true,
        tierLevels: DEFAULT_TIER_LEVELS,
      });
    }

    const docSnap = await adminDb.collection("config").doc("tier_levels").get();
    let tierLevels: TierLevelItem[] = [];

    if (docSnap.exists) {
      const data = docSnap.data() || {};
      tierLevels = Array.isArray(data.items) ? data.items : [];
    }

    if (tierLevels.length === 0) {
      tierLevels = DEFAULT_TIER_LEVELS;
    }

    return NextResponse.json({
      success: true,
      tierLevels,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Tier Levels GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch tier levels", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json() || {};
    const { action, id, name, dailyLimit, singleLimit, maxBalance, description, items } = body;
    const nowIso = new Date().toISOString();

    if (perm.auth?.uid === "mock-admin-uid") {
      return NextResponse.json({
        success: true,
        message: "Mock Tier Levels updated successfully!",
        tierLevels: items || DEFAULT_TIER_LEVELS,
      });
    }

    const docRef = adminDb.collection("config").doc("tier_levels");
    const docSnap = await docRef.get();
    let currentItems: TierLevelItem[] = docSnap.exists && Array.isArray(docSnap.data()?.items)
      ? docSnap.data()!.items
      : [...DEFAULT_TIER_LEVELS];

    if (action === "save_all" && Array.isArray(items)) {
      currentItems = items.map((t: TierLevelItem) => ({
        id: t.id || `tier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: String(t.name || "Custom Tier").trim(),
        dailyLimit: Math.max(0, Number(t.dailyLimit) || 0),
        singleLimit: Math.max(0, Number(t.singleLimit) || 0),
        maxBalance: Math.max(0, Number(t.maxBalance) || 0),
        description: t.description || "",
        isDefault: !!t.isDefault,
        updatedAt: nowIso,
      }));

      await docRef.set({ items: currentItems, updatedAt: nowIso }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "All Assign Tier Levels updated successfully!",
        tierLevels: currentItems,
      });
    }

    if (action === "create") {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: "Tier level name is required." }, { status: 400 });
      }

      const newTierId = id || `tier_${Date.now()}`;
      const newTier: TierLevelItem = {
        id: newTierId,
        name: name.trim(),
        dailyLimit: Math.max(0, Number(dailyLimit) || 0),
        singleLimit: Math.max(0, Number(singleLimit) || 0),
        maxBalance: Math.max(0, Number(maxBalance) || 0),
        description: description?.trim() || "",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      currentItems.push(newTier);
      await docRef.set({ items: currentItems, updatedAt: nowIso }, { merge: true });

      return NextResponse.json({
        success: true,
        message: `Tier level "${newTier.name}" created successfully!`,
        tierLevels: currentItems,
      });
    }

    if (action === "update") {
      if (!id) {
        return NextResponse.json({ error: "Missing Tier level ID for update." }, { status: 400 });
      }

      const index = currentItems.findIndex((t) => t.id === id);
      if (index === -1) {
        return NextResponse.json({ error: "Target Tier level not found." }, { status: 404 });
      }

      currentItems[index] = {
        ...currentItems[index],
        ...(name && { name: name.trim() }),
        ...(dailyLimit !== undefined && { dailyLimit: Math.max(0, Number(dailyLimit)) }),
        ...(singleLimit !== undefined && { singleLimit: Math.max(0, Number(singleLimit)) }),
        ...(maxBalance !== undefined && { maxBalance: Math.max(0, Number(maxBalance)) }),
        ...(description !== undefined && { description: description.trim() }),
        updatedAt: nowIso,
      };

      await docRef.set({ items: currentItems, updatedAt: nowIso }, { merge: true });

      return NextResponse.json({
        success: true,
        message: `Tier level "${currentItems[index].name}" updated successfully!`,
        tierLevels: currentItems,
      });
    }

    if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Missing Tier level ID for deletion." }, { status: 400 });
      }

      currentItems = currentItems.filter((t) => t.id !== id);
      await docRef.set({ items: currentItems, updatedAt: nowIso }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Tier level deleted successfully!",
        tierLevels: currentItems,
      });
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Tier Levels POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update tier levels", details: error.message }, { status: 500 });
  }
}
