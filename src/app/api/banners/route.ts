import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page"); // optional target page filter

    const bannersSnap = await adminDb.collection("banners").get();
    let banners = bannersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    if (page) {
      banners = banners.filter((b: any) => b.targetPage === "all" || b.targetPage === page);
    }

    // Filter out hidden slides for public consumption
    banners = banners.filter((b: any) => b.isHidden !== true);

    // Sort by position ascending (1, 2, 3...), falling back to createdAt descending
    banners.sort((a, b) => {
      const posA = typeof a.position === "number" ? a.position : 9999;
      const posB = typeof b.position === "number" ? b.position : 9999;
      if (posA !== posB) return posA - posB;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ success: true, banners });
  } catch (err: any) {
    console.error("[Public Banners GET Exception]:", err.message);
    return NextResponse.json({ error: "Failed to fetch banners", details: err.message }, { status: 500 });
  }
}
