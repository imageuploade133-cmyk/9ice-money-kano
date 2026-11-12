import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "banners.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const bannersSnap = await adminDb.collection("banners").get();
    const banners = bannersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

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
    console.error("[Admin Banners GET Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "banners.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { id, imageUrl, title, description, targetPage, link, position, customWidth, customHeight, mobileHeight, desktopHeight, marginBottom, isCrop, isHidden } = body;

    if (!imageUrl || !imageUrl.trim()) {
      return NextResponse.json({ error: "Image URL is required for the banner slide." }, { status: 400 });
    }

    if (!targetPage || !["all", "bills", "investment", "referral", "transfer", "store", "estate"].includes(targetPage)) {
      return NextResponse.json({ error: "Valid targetPage parameter is required ('all', 'bills', 'investment', 'referral', 'transfer', 'store', 'estate')." }, { status: 400 });
    }

    const parsedPosition = typeof position === "number" ? Math.max(1, position) : (typeof position === "string" && !isNaN(parseInt(position)) ? Math.max(1, parseInt(position)) : 1);

    const bannerDoc = {
      imageUrl: imageUrl.trim(),
      title: (title || "").trim(),
      description: (description || "").trim(),
      targetPage,
      link: (link || "").trim(),
      position: parsedPosition,
      customWidth: typeof customWidth === "number" ? customWidth : null,
      customHeight: typeof customHeight === "number" ? customHeight : null,
      mobileHeight: typeof mobileHeight === "number" ? mobileHeight : null,
      desktopHeight: typeof desktopHeight === "number" ? desktopHeight : null,
      marginBottom: typeof marginBottom === "number" ? marginBottom : null,
      isCrop: isCrop !== undefined ? Boolean(isCrop) : true,
      isHidden: isHidden !== undefined ? Boolean(isHidden) : false,
      updatedAt: new Date().toISOString()
    };

    if (id) {
      await adminDb.collection("banners").doc(id).set(bannerDoc, { merge: true });
      return NextResponse.json({
        success: true,
        message: "Banner slide updated successfully!",
        banner: { id, ...bannerDoc }
      });
    }

    const docRef = await adminDb.collection("banners").add({
      ...bannerDoc,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: "Banner slide added successfully!",
      banner: { id: docRef.id, ...bannerDoc }
    });
  } catch (err: any) {
    console.error("[Admin Banners POST Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "banners.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Banner identifier (id) is required for deletion." }, { status: 400 });
    }

    await adminDb.collection("banners").doc(id).delete();

    return NextResponse.json({
      success: true,
      message: "Banner slide deleted successfully!"
    });
  } catch (err: any) {
    console.error("[Admin Banners DELETE Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
