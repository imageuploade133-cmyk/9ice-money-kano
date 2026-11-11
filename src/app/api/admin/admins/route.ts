import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createFirebaseAuthUser, setFirebaseAuthCustomClaims, getFirebaseAuthUserByEmail } from "@/lib/firebase-auth-rest";
import { requireAdminPermission, CPANEL_PERMISSIONS_CATALOG } from "@/lib/admin-permissions";

async function logAdminAction(payload: {
  adminUid: string;
  adminEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  result?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    const now = new Date().toISOString();
    await adminDb.collection("admin_audit_logs").add({
      ...payload,
      timestamp: now,
      createdAt: now,
    });
  } catch (err: any) {
    console.warn("[Admin Audit Log Error]:", err.message);
  }
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "admins.view");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const auth = perm.auth;

    // Return list of admins from admin_users collection
    const snap = await adminDb.collection("admin_users").orderBy("createdAt", "desc").get();
    const admins: any[] = [];
    snap.forEach((doc) => {
      admins.push({ uid: doc.id, ...doc.data() });
    });

    return NextResponse.json({
      success: true,
      admins,
      catalog: CPANEL_PERMISSIONS_CATALOG,
      callerRole: auth.role,
    });
  } catch (err: any) {
    console.error("[Admin Management GET Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch administrator directory." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "admins.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const auth = perm.auth;

    const callerRole = (auth.role || "").toLowerCase();
    const isSuperAdmin = callerRole === "super_admin" || auth.permissions?.includes("*") || auth.email === "abdulkadir123shaba@gmail.com";

    if (!isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can manage administrator accounts." }, { status: 403 });
    }

    const body = await req.json();
    const { action, adminData } = body;
    const now = new Date().toISOString();

    if (action === "create_admin") {
      const { email, password, displayName, phoneNumber, role, permissions, pin } = adminData || {};
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Valid administrator email address is required." }, { status: 400 });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      let cleanPhone = String(phoneNumber || "").trim().replace(/[^\d+]/g, "");
      if (cleanPhone && cleanPhone.startsWith("0")) {
        cleanPhone = "+234" + cleanPhone.slice(1);
      } else if (cleanPhone && !cleanPhone.startsWith("+") && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
        cleanPhone = "+234" + cleanPhone;
      }

      const cleanPin = String(pin || "").trim();
      if (cleanPin && (cleanPin.length !== 4 || isNaN(Number(cleanPin)))) {
        return NextResponse.json({ error: "Access PIN must be a valid 4-digit numeric code." }, { status: 400 });
      }

      // Check if admin already exists
      const existingSnap = await adminDb.collection("admin_users").where("email", "==", cleanEmail).limit(1).get();
      if (!existingSnap.empty) {
        return NextResponse.json({ error: "An administrator with this email already exists." }, { status: 400 });
      }

      // Create or look up in Firebase Authentication via dependency-free REST API
      let firebaseUid = "";

      const existingUser = await getFirebaseAuthUserByEmail(cleanEmail);
      if (existingUser) {
        firebaseUid = existingUser.uid;
      } else {
        if (!password || password.length < 6) {
          return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
        }
        const createdUser = await createFirebaseAuthUser({
          email: cleanEmail,
          password,
          displayName: displayName || cleanEmail.split("@")[0],
        });
        firebaseUid = createdUser.uid;
      }

      const newAdminRecord: any = {
        uid: firebaseUid,
        email: cleanEmail,
        displayName: displayName || cleanEmail.split("@")[0],
        phoneNumber: cleanPhone,
        role: role || "admin",
        permissions: Array.isArray(permissions) ? permissions : ["users.view", "transactions.view", "kyc.view"],
        status: "active",
        createdBy: auth.email || auth.uid,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: "",
        mfaEnabled: false,
      };

      if (cleanPin) {
        newAdminRecord.pin = cleanPin;
        newAdminRecord.isPinRequired = true;
      }

      await adminDb.collection("admin_users").doc(firebaseUid).set(newAdminRecord);

      // Also set pin in users collection if exists or create basic profile
      const userRef = adminDb.collection("users").doc(firebaseUid);
      await userRef.set({
        uid: firebaseUid,
        name: displayName || cleanEmail.split("@")[0],
        email: cleanEmail,
        phoneNumber: cleanPhone,
        role: role || "admin",
        permissions: Array.isArray(permissions) ? permissions : ["users.view", "transactions.view", "kyc.view"],
        ...(cleanPin ? { pin: cleanPin, isPinRequired: true } : {}),
        createdAt: now,
      }, { merge: true });

      // Set Custom Claims via dependency-free REST API
      try {
        await setFirebaseAuthCustomClaims(firebaseUid, {
          admin: true,
          role: role || "admin",
        });
      } catch (e: any) {
        console.warn("[Create Admin Claims Warning]:", e.message);
      }

      await logAdminAction({
        adminUid: auth.uid,
        adminEmail: auth.email || "",
        action: "create_admin",
        resource: "admin_users",
        resourceId: firebaseUid,
        newValue: newAdminRecord,
        result: "SUCCESS",
      });

      return NextResponse.json({
        success: true,
        message: `Administrator ${cleanEmail} created successfully!`,
        admin: newAdminRecord,
      });

    } else if (action === "update_admin") {
      const { targetUid, role, permissions, status, displayName, phoneNumber, pin } = adminData || {};
      if (!targetUid) {
        return NextResponse.json({ error: "Target administrator UID is required." }, { status: 400 });
      }

      const targetRef = adminDb.collection("admin_users").doc(targetUid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return NextResponse.json({ error: "Administrator document not found." }, { status: 404 });
      }

      const currentData = targetSnap.data() || {};

      // Guard against disabling or deleting the last Super Admin
      if (currentData.role === "super_admin" && (role && role !== "super_admin" || status === "disabled")) {
        const superAdminSnap = await adminDb.collection("admin_users")
          .where("role", "==", "super_admin")
          .where("status", "==", "active")
          .get();

        if (superAdminSnap.size <= 1) {
          return NextResponse.json({ error: "Cannot disable or demote the last remaining active Super Admin." }, { status: 400 });
        }
      }

      const updatePayload: any = {
        updatedAt: now,
      };

      if (role !== undefined) updatePayload.role = role;
      if (permissions !== undefined) updatePayload.permissions = permissions;
      if (status !== undefined) updatePayload.status = status;
      if (displayName !== undefined) updatePayload.displayName = displayName;
      if (phoneNumber !== undefined) {
        let cleanPhone = String(phoneNumber || "").trim().replace(/[^\d+]/g, "");
        if (cleanPhone && cleanPhone.startsWith("0")) {
          cleanPhone = "+234" + cleanPhone.slice(1);
        } else if (cleanPhone && !cleanPhone.startsWith("+") && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
          cleanPhone = "+234" + cleanPhone;
        }
        updatePayload.phoneNumber = cleanPhone;
      }

      if (pin) {
        const cleanPin = String(pin).trim();
        if (cleanPin.length !== 4 || isNaN(Number(cleanPin))) {
          return NextResponse.json({ error: "Access PIN must be a valid 4-digit numeric code." }, { status: 400 });
        }
        updatePayload.pin = cleanPin;
        updatePayload.isPinRequired = true;

        // Sync to users collection
        await adminDb.collection("users").doc(targetUid).set({
          pin: cleanPin,
          isPinRequired: true,
          updatedAt: now,
        }, { merge: true });
      }

      await targetRef.update(updatePayload);

      await logAdminAction({
        adminUid: auth.uid,
        adminEmail: auth.email || "",
        action: "update_admin",
        resource: "admin_users",
        resourceId: targetUid,
        oldValue: currentData,
        newValue: updatePayload,
        result: "SUCCESS",
      });

      return NextResponse.json({
        success: true,
        message: "Administrator account updated successfully!",
      });

    } else if (action === "set_pin" || action === "set_admin_pin") {
      const { targetUid, pin } = adminData || body || {};
      if (!targetUid) {
        return NextResponse.json({ error: "Target administrator UID is required." }, { status: 400 });
      }

      const cleanPin = String(pin || "").trim();
      if (cleanPin.length !== 4 || isNaN(Number(cleanPin))) {
        return NextResponse.json({ error: "Access PIN must be a valid 4-digit numeric code." }, { status: 400 });
      }

      const targetRef = adminDb.collection("admin_users").doc(targetUid);
      const targetSnap = await targetRef.get();

      if (targetSnap.exists) {
        await targetRef.update({
          pin: cleanPin,
          isPinRequired: true,
          updatedAt: now,
          pinUpdatedAt: now,
          pinUpdatedBy: auth.email || auth.uid,
        });
      }

      // Also update user document in users collection
      const userRef = adminDb.collection("users").doc(targetUid);
      await userRef.set({
        pin: cleanPin,
        isPinRequired: true,
        updatedAt: now,
        pinUpdatedAt: now,
        pinUpdatedBy: auth.email || auth.uid,
      }, { merge: true });

      await logAdminAction({
        adminUid: auth.uid,
        adminEmail: auth.email || "",
        action: "set_admin_pin",
        resource: "admin_users",
        resourceId: targetUid,
        newValue: { pinSet: true },
        result: "SUCCESS",
      });

      return NextResponse.json({
        success: true,
        message: `4-Digit Access PIN successfully created and updated for administrator!`,
      });

    } else if (action === "delete_admin") {
      const { targetUid } = adminData || {};
      if (!targetUid) {
        return NextResponse.json({ error: "Target administrator UID is required." }, { status: 400 });
      }

      const targetRef = adminDb.collection("admin_users").doc(targetUid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return NextResponse.json({ error: "Administrator document not found." }, { status: 404 });
      }

      const currentData = targetSnap.data() || {};

      if (currentData.role === "super_admin") {
        const superAdminSnap = await adminDb.collection("admin_users")
          .where("role", "==", "super_admin")
          .where("status", "==", "active")
          .get();

        if (superAdminSnap.size <= 1) {
          return NextResponse.json({ error: "Cannot delete the last remaining active Super Admin." }, { status: 400 });
        }
      }

      await targetRef.delete();

      await logAdminAction({
        adminUid: auth.uid,
        adminEmail: auth.email || "",
        action: "delete_admin",
        resource: "admin_users",
        resourceId: targetUid,
        oldValue: currentData,
        result: "SUCCESS",
      });

      return NextResponse.json({
        success: true,
        message: "Administrator removed successfully!",
      });

    } else {
      return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
    }

  } catch (err: any) {
    console.error("[Admin Management POST Error]:", err.message);
    return NextResponse.json({ error: err.message || "Operation failed." }, { status: 500 });
  }
}
