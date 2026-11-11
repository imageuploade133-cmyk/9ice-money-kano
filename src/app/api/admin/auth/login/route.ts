import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.CPANEL_SESSION_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[CPanel Auth Security Warning]: CPANEL_SESSION_SECRET environment variable is missing in production!");
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || "cpanel_secure_session_secret_987654321_etech_global";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const body = await req.json();
    const { email, idToken } = body;

    const token = (idToken || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "") || "").trim();

    if (!email || !token) {
      return NextResponse.json({ error: "Email and Firebase Authentication ID token are required." }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Verify Firebase ID token natively using Node crypto + Google certs
    const decodedToken = await verifyFirebaseIdToken(token);
    const uid = decodedToken.uid;

    if (!uid) {
      return NextResponse.json({ error: "Invalid or expired Firebase ID token." }, { status: 401 });
    }

    // Fetch administrator record from admin_users collection
    const adminDocRef = adminDb.collection("admin_users").doc(uid);
    const adminSnap = await adminDocRef.get();

    if (!adminSnap.exists) {
      return NextResponse.json({ error: "Access Denied: Account is not configured in administrator directory." }, { status: 403 });
    }

    const adminData = adminSnap.data() || {};

    if (adminData.status !== "active") {
      return NextResponse.json({ error: "Access Denied: Administrator account is disabled or suspended." }, { status: 403 });
    }

    const now = new Date().toISOString();

    // Update last login timestamp in admin_users
    await adminDocRef.update({
      lastLoginAt: now,
      updatedAt: now
    });

    const finalRole = adminData.role || "admin";

    // Generate JWT CPanel Session
    const payload = {
      uid,
      email: cleanEmail,
      role: finalRole
    };
    const cpanelToken = jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: "24h" });

    const response = NextResponse.json({
      success: true,
      message: "Administrator Authentication Granted!",
      user: {
        uid,
        name: adminData.displayName || "Administrator",
        email: cleanEmail,
        role: finalRole,
        permissions: adminData.permissions || []
      }
    });

    response.cookies.set("cpanel_session", cpanelToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 // 24 hours
    });

    return response;

  } catch (err: any) {
    console.error("[CPanel Firebase Auth Login Exception] Error:", err.message);
    return NextResponse.json({ error: "Internal Authentication Error", details: err.message }, { status: 500 });
  }
}
