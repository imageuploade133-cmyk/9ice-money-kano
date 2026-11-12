import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET /api/estate/admin/slides - List all estate slides for CPanel admin
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.view");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const snap = await adminDb.collection("estate_slides").get();
    const slides: any[] = [];

    snap.forEach((docSnap) => {
      slides.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });

    slides.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    return NextResponse.json({ success: true, slides });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/slides Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch estate slides." }, { status: 500 });
  }
}

// POST /api/estate/admin/slides - Create / Edit / Toggle Visibility / Delete estate slide
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.manage");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const body = await req.json();
    const { action, slideId, title, subtitle, imageUrl, targetUrl, badgeText, order, isHidden } = body;
    const nowIso = new Date().toISOString();

    if (action === "delete") {
      if (!slideId) {
        return NextResponse.json({ error: "Slide ID is required for deletion." }, { status: 400 });
      }
      await adminDb.collection("estate_slides").doc(slideId).delete();
      return NextResponse.json({ success: true, message: "Estate slide deleted successfully." });
    }

    if (action === "toggle_visibility") {
      if (!slideId) {
        return NextResponse.json({ error: "Slide ID is required." }, { status: 400 });
      }
      const ref = adminDb.collection("estate_slides").doc(slideId);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Slide not found." }, { status: 404 });
      }
      const currentHidden = !!snap.data()?.isHidden;
      await ref.update({ isHidden: !currentHidden, updatedAt: nowIso });
      return NextResponse.json({
        success: true,
        message: !currentHidden ? "Slide hidden from marketplace." : "Slide made visible.",
      });
    }

    // Create or Edit Slide
    if (!imageUrl || !imageUrl.trim()) {
      return NextResponse.json({ error: "Slide image URL is required." }, { status: 400 });
    }

    const targetDocRef = slideId
      ? adminDb.collection("estate_slides").doc(slideId)
      : adminDb.collection("estate_slides").doc();

    const slidePayload = {
      id: targetDocRef.id,
      title: title ? String(title).trim() : "",
      subtitle: subtitle ? String(subtitle).trim() : "",
      imageUrl: String(imageUrl).trim(),
      targetUrl: targetUrl ? String(targetUrl).trim() : "",
      badgeText: badgeText ? String(badgeText).trim() : "Featured",
      order: Number(order) || 0,
      isHidden: Boolean(isHidden),
      updatedAt: nowIso,
      createdAt: slideId ? (await targetDocRef.get()).data()?.createdAt || nowIso : nowIso,
    };

    await targetDocRef.set(slidePayload, { merge: true });

    return NextResponse.json({
      success: true,
      message: slideId ? "Estate slide updated successfully." : "Estate slide created successfully.",
      slide: slidePayload,
    });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/slides Error]:", err.message);
    return NextResponse.json({ error: "Failed to save estate slide." }, { status: 500 });
  }
}
