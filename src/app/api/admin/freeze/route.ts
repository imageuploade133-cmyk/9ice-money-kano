import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "freeze.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get("search") || searchParams.get("q") || "").trim().toLowerCase();

    if (!searchQuery) {
      return NextResponse.json({ success: true, users: [] });
    }

    const usersSnap = await adminDb.collection("users").get();
    const results: any[] = [];

    usersSnap.forEach((doc) => {
      const data = doc.data();
      const email = (data.email || "").toLowerCase();
      const phone = (data.phoneNumber || data.phone || "").toLowerCase();
      const name = (data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`).toLowerCase();
      const bvn = (data.bvn || data.nin || "").toLowerCase();

      if (
        email.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        name.includes(searchQuery) ||
        bvn.includes(searchQuery)
      ) {
        results.push({
          uid: doc.id,
          name: data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "User",
          email: data.email || "",
          phoneNumber: data.phoneNumber || data.phone || "",
          isFrozen: !!data.isFrozen,
          freezeMessage: data.freezeMessage || "Dear Customer please Contact Us or Visit Our Office for assistance",
          updatedAt: data.updatedAt || "",
        });
      }
    });

    return NextResponse.json({
      success: true,
      users: results,
      count: results.length,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Freeze GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to search users", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "freeze.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { uid, targetUid, isFrozen, freezeMessage } = body;
    const userUid = targetUid || uid;

    if (!userUid) {
      return NextResponse.json({ error: "Missing required parameter: userUid" }, { status: 400 });
    }

    const defaultMsg = "Dear Customer please Contact Us or Visit Our Office for assistance";
    const customMsg = typeof freezeMessage === "string" && freezeMessage.trim() ? freezeMessage.trim() : defaultMsg;

    const userRef = adminDb.collection("users").doc(userUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "Target user profile not found." }, { status: 404 });
    }

    await userRef.set(
      {
        isFrozen: !!isFrozen,
        freezeMessage: customMsg,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: isFrozen ? "User account has been frozen." : "User account has been unfrozen.",
      userUid,
      isFrozen: !!isFrozen,
      freezeMessage: customMsg,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Freeze POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update user freeze status", details: error.message }, { status: 500 });
  }
}
