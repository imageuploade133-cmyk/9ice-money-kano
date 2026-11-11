import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase-admin";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.CPANEL_SESSION_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[Admin Session Security Warning]: CPANEL_SESSION_SECRET environment variable is missing in production!");
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || "cpanel_secure_session_secret_987654321_etech_global";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("cpanel_session")?.value;

    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "No active session." }, { status: 401 });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(sessionToken, EFFECTIVE_JWT_SECRET);
    } catch (jwtErr) {
      return NextResponse.json({ success: false, error: "Session expired or invalid." }, { status: 401 });
    }

    if (!decoded || !decoded.uid) {
      return NextResponse.json({ success: false, error: "Invalid session token." }, { status: 401 });
    }

    // Mock playtesting
    if (decoded.uid === "mock-admin-uid") {
      return NextResponse.json({
        success: true,
        user: {
          uid: "mock-admin-uid",
          name: "MOCK SUPER ADMIN",
          email: decoded.email,
          role: "super_admin",
          permissions: ["*"]
        }
      });
    }

    // Query admin doc from admin_users collection using UID
    const adminDocSnap = await adminDb.collection("admin_users").doc(decoded.uid).get();
    if (!adminDocSnap.exists) {
      return NextResponse.json({ success: false, error: "Admin profile not configured in admin_users." }, { status: 401 });
    }

    const adminData = adminDocSnap.data() || {};

    if (adminData.status !== "active") {
      return NextResponse.json({ success: false, error: "Administrator account is disabled or suspended." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      user: {
        uid: decoded.uid,
        name: adminData.displayName || "Administrator",
        email: adminData.email || decoded.email,
        role: adminData.role || "admin",
        permissions: adminData.permissions || []
      }
    });

  } catch (err: any) {
    console.error("[CPanel Session Exception] Error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
