import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";

export async function GET(req: Request) {
  try {
    const authUser = await authenticateUserRequest(req);
    if (!authUser || !authUser.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database uninitialized" }, { status: 500 });
    }

    const docSnap = await adminDb.collection("tier_upgrade_requests").doc(authUser.uid).get();

    if (!docSnap.exists) {
      return NextResponse.json({ success: true, request: null });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: docSnap.id,
        ...docSnap.data(),
      },
    });
  } catch (err: any) {
    console.error("[Tier Upgrade GET] Error:", err.message);
    return NextResponse.json({ error: "Failed to fetch tier upgrade request" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await authenticateUserRequest(req);
    if (!authUser || !authUser.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database uninitialized" }, { status: 500 });
    }

    const body = await req.json() || {};
    const { fullName, bvn, proofOfAddressUrl, selfieUrl, governmentIdUrl, governmentIdType = "National ID Card (NIN)", targetTier = "Tier 2" } = body;

    if (!fullName || !fullName.trim()) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }

    if (!bvn || bvn.trim().length !== 11) {
      return NextResponse.json({ error: "A valid 11-digit BVN or NIN number is required." }, { status: 400 });
    }

    if (!governmentIdUrl || !governmentIdUrl.trim()) {
      return NextResponse.json({ error: "Government ID document is required." }, { status: 400 });
    }

    if (!proofOfAddressUrl || !proofOfAddressUrl.trim()) {
      return NextResponse.json({ error: "Proof of address document is required." }, { status: 400 });
    }

    if (!selfieUrl || !selfieUrl.trim()) {
      return NextResponse.json({ error: "Live selfie picture is required." }, { status: 400 });
    }

    // Check user's current tier
    const userSnap = await adminDb.collection("users").doc(authUser.uid).get();
    const userData = userSnap.data() || {};
    const currentTier = userData.tier || "Tier 1";

    const requestData = {
      userId: authUser.uid,
      fullName: fullName.trim(),
      email: authUser.email || userData.email || "",
      phoneNumber: userData.phoneNumber || userData.phone || "",
      bvn: bvn.trim(),
      governmentIdUrl: governmentIdUrl.trim(),
      governmentIdType: governmentIdType.trim(),
      proofOfAddressUrl: proofOfAddressUrl.trim(),
      selfieUrl: selfieUrl.trim(),
      targetTier,
      currentTier,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await adminDb.collection("tier_upgrade_requests").doc(authUser.uid).set(requestData, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Tier upgrade request submitted successfully. Pending administrative review.",
      request: requestData,
    });
  } catch (err: any) {
    console.error("[Tier Upgrade POST] Error:", err.message);
    return NextResponse.json({ error: err.message || "Failed to submit tier upgrade request" }, { status: 500 });
  }
}
