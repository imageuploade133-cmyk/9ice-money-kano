import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { updateFirebaseAuthPassword, updateFirebaseAuthUser } from "@/lib/firebase-auth-rest";

export async function GET(req: Request) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDocSnap = await adminDb.collection("admin_users").doc(auth.uid).get();
    const adminData = adminDocSnap.exists ? adminDocSnap.data() || {} : {};

    return NextResponse.json({
      success: true,
      profile: {
        uid: auth.uid,
        email: adminData.email || auth.email || "",
        displayName: adminData.displayName || "Administrator",
        phoneNumber: adminData.phoneNumber || "",
        role: adminData.role || auth.role || "admin",
        permissions: adminData.permissions || auth.permissions || [],
        createdAt: adminData.createdAt || new Date().toISOString(),
        lastLoginAt: adminData.lastLoginAt || new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch admin profile", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyAdminAuth(req);
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "update_phone") {
      const { phoneNumber } = body;
      const cleanPhone = (phoneNumber || "").trim();

      await adminDb.collection("admin_users").doc(auth.uid).set({
        phoneNumber: cleanPhone,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Also update users collection if record exists
      try {
        await adminDb.collection("users").doc(auth.uid).set({
          phoneNumber: cleanPhone,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch {
        // Ignore if not present in users collection
      }

      return NextResponse.json({
        success: true,
        message: "Phone number updated successfully!",
        phoneNumber: cleanPhone,
      });
    } else if (action === "change_password") {
      const { newPassword } = body;

      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters long." }, { status: 400 });
      }

      await updateFirebaseAuthPassword(auth.uid, newPassword);

      await adminDb.collection("admin_users").doc(auth.uid).set({
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Password changed successfully!",
      });
    } else {
      return NextResponse.json({ error: "Invalid profile update action." }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Profile update failed", details: err.message }, { status: 500 });
  }
}
