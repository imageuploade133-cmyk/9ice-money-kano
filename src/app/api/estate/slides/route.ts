import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export interface EstateSlide {
  id: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl?: string;
  badgeText?: string;
  order: number;
  isHidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// GET /api/estate/slides - Public fetch active visible estate slides
export async function GET() {
  try {
    const snap = await adminDb
      .collection("estate_slides")
      .where("isHidden", "!=", true)
      .limit(20)
      .get();

    const slides: EstateSlide[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      slides.push({
        id: docSnap.id,
        title: d.title || "",
        subtitle: d.subtitle || "",
        imageUrl: d.imageUrl || "",
        targetUrl: d.targetUrl || "",
        badgeText: d.badgeText || "Featured",
        order: Number(d.order) || 0,
        isHidden: !!d.isHidden,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
    });

    slides.sort((a, b) => a.order - b.order);

    return NextResponse.json({ success: true, slides });
  } catch (err: any) {
    console.error("[GET /api/estate/slides Error]:", err.message);
    return NextResponse.json({ success: true, slides: [] });
  }
}
