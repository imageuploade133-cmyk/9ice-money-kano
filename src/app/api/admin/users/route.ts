import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createFirebaseAuthUser, setFirebaseAuthCustomClaims } from "@/lib/firebase-auth-rest";
import { requireAdminPermission, CPANEL_PERMISSIONS_CATALOG } from "@/lib/admin-permissions";

const ALLOWED_PERMISSIONS = CPANEL_PERMISSIONS_CATALOG.map((p) => p.key);

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.view");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const { searchParams } = new URL(req.url);
    const searchTerm = searchParams.get("search")?.trim().toLowerCase() || "";

    // Mock response for playtesting sessions
    if (uid === "mock-admin-uid") {
      const mockUsers = [
        {
          uid: "mock-user-1",
          name: "JULES VERNE",
          email: "jules@example.com",
          phoneNumber: "+2348011223344",
          role: "admin",
          permissions: ["can_transact", "can_view_audit_logs", "can_manage_gateways"],
          balance: 750000,
          usdBalance: 2500,
          xofBalance: 320000,
          bonusBalance: 15000,
          createdAt: new Date().toISOString()
        },
        {
          uid: "mock-user-2",
          name: "STEVE COLLINS",
          email: "steve@example.com",
          phoneNumber: "+2348122334455",
          role: "user",
          permissions: ["can_transact"],
          balance: 45000,
          usdBalance: 120,
          xofBalance: 45000,
          bonusBalance: 2500,
          createdAt: new Date().toISOString()
        }
      ];

      if (searchTerm) {
        const filtered = mockUsers.filter(u =>
          u.email.toLowerCase().includes(searchTerm) ||
          u.phoneNumber.includes(searchTerm) ||
          ((u as any).bvn && (u as any).bvn.includes(searchTerm)) ||
          u.name.toLowerCase().includes(searchTerm)
        );
        return NextResponse.json({ success: true, users: filtered });
      }

      return NextResponse.json({ success: true, users: mockUsers });
    }

    const users: any[] = [];

    // Low-cost multi-field indexed query
    if (searchTerm) {
      if (searchTerm.includes("@")) {
        // Query exactly by email
        const snap = await adminDb.collection("users")
          .where("email", "==", searchTerm)
          .limit(20)
          .get();

        snap.forEach(doc => {
          const data = doc.data();
          users.push({ uid: doc.id, ...data });
        });
      } else {
        // Query by phoneNumber or BVN or Name
        const queries = [
          adminDb.collection("users").where("phoneNumber", "==", searchTerm).limit(20).get(),
          adminDb.collection("users").where("bvn", "==", searchTerm).limit(20).get(),
          adminDb.collection("users").where("name", "==", searchTerm.toUpperCase()).limit(20).get()
        ];

        const snaps = await Promise.all(queries);
        snaps.forEach(snap => {
          snap.forEach(doc => {
            const data = doc.data();
            if (!users.some(u => u.uid === doc.id)) {
              users.push({ uid: doc.id, ...data });
            }
          });
        });

        // Fallback: Try variations for phone prefix
        if (users.length === 0) {
          const rawDigits = searchTerm.replace(/\D/g, "");
          if (rawDigits.length >= 7) {
            const variations = [
              searchTerm,
              `+234${rawDigits.startsWith("0") ? rawDigits.slice(1) : rawDigits}`,
              `+227${rawDigits.startsWith("0") ? rawDigits.slice(1) : rawDigits}`,
              rawDigits
            ];
            const querySnap = await adminDb.collection("users")
              .where("phoneNumber", "in", variations)
              .limit(20)
              .get();

            querySnap.forEach(doc => {
              const data = doc.data();
              if (!users.some(u => u.uid === doc.id)) {
                users.push({ uid: doc.id, ...data });
              }
            });
          }
        }
      }
    } else {
      // Default: Return latest 20 users
      const usersSnap = await adminDb.collection("users")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      usersSnap.forEach(doc => {
        const data = doc.data();
        users.push({ uid: doc.id, ...data });
      });
    }

    if (users.length === 0) {
      return NextResponse.json({ success: true, users: [] });
    }

    // High-performance batch read for user wallets using adminDb.getAll()
    const walletRefs: FirebaseFirestore.DocumentReference[] = [];
    users.forEach(u => {
      const userUid = u.uid || u.id;
      walletRefs.push(adminDb.collection("wallets").doc(`${userUid}_USD`));
      walletRefs.push(adminDb.collection("wallets").doc(`${userUid}_XOF`));
    });

    const walletDocSnaps = await adminDb.getAll(...walletRefs);
    const walletBalancesMap: Record<string, number> = {};

    walletDocSnaps.forEach(doc => {
      if (doc.exists) {
        walletBalancesMap[doc.id] = Number(doc.data()?.balance) || 0;
      }
    });

    const sanitizedUsers = users.map(u => {
      const userUid = u.uid || u.id;

      const usdBalance = walletBalancesMap[`${userUid}_USD`] || 0;
      const xofBalance = walletBalancesMap[`${userUid}_XOF`] || 0;
      const bonusBalance = u.bonusBalance || 0;

      return {
        uid: userUid,
        name: u.name || u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "USER",
        email: u.email || "",
        phoneNumber: u.phoneNumber || "",
        role: u.role || "user",
        permissions: u.permissions || [],
        balance: u.balance || 0,
        usdBalance,
        xofBalance,
        bonusBalance,
        createdAt: u.createdAt || new Date().toISOString()
      };
    });

    return NextResponse.json({ success: true, users: sanitizedUsers });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Users API] Error:", error.message);
    return NextResponse.json({ error: "Unauthorized or server error", details: error.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const body = await req.json();
    const { action } = body;

    // Actions: "create" or "update"
    if (action === "create") {
      const {
        firstName,
        lastName,
        email,
        password,
        phonePrefix,
        phoneNumber,
        balance,
        role,
        permissions,
        pin
      } = body;

      // Enforce administrative creation privileges: Only SUPER_ADMIN or root can create administrative accounts
      const adminDoc = await adminDb.collection("admin_users").doc(uid).get();
      const adminData = adminDoc.exists ? adminDoc.data() || {} : {};
      const callerRole = (adminData.role || "").toLowerCase();

      const isCallerSuperAdmin = (callerRole === "super_admin" || uid === "mock-admin-uid");
      const isAdminRole = ["super_admin", "admin", "finance", "kyc_admin", "support", "read_only"].includes(role);

      if (isAdminRole) {
        if (!isCallerSuperAdmin) {
          return NextResponse.json({ error: "Access denied: Only a SUPER_ADMIN can create administrative accounts." }, { status: 403 });
        }
      }

      // Validate inputs
      if (!firstName || firstName.trim().length < 2) {
        return NextResponse.json({ error: "First name must be at least 2 characters." }, { status: 400 });
      }
      if (!lastName || lastName.trim().length < 2) {
        return NextResponse.json({ error: "Last name must be at least 2 characters." }, { status: 400 });
      }
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Invalid email address format." }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = `${phonePrefix || ""}${phoneNumber || ""}`.trim();

      // Check permissions safety
      const cleanPermissions = (permissions || []).filter((p: string) => ALLOWED_PERMISSIONS.includes(p));

      // Mock session playtesting
      if (uid === "mock-admin-uid") {
        return NextResponse.json({
          success: true,
          message: "Mock user successfully simulated!",
          user: {
            uid: `mock-uid-${Date.now()}`,
            name: `${firstName} ${lastName}`.toUpperCase(),
            email: cleanEmail,
            phoneNumber: cleanPhone,
            role: role || "user",
            permissions: cleanPermissions,
            balance: Number(balance) || 0,
            createdAt: new Date().toISOString()
          }
        });
      }

      // Check existence
      const emailQuery = await adminDb.collection("users")
        .where("email", "==", cleanEmail)
        .limit(1)
        .get();

      if (!emailQuery.empty) {
        return NextResponse.json({ error: "A user with this email address already exists." }, { status: 400 });
      }

      // Create in Firebase Authentication via dependency-free REST API
      const userRecord = await createFirebaseAuthUser({
        email: cleanEmail,
        password,
        displayName: `${firstName.trim()} ${lastName.trim()}`.toUpperCase(),
      });

      // Synchronize role Custom Claims instantly via dependency-free REST API
      await setFirebaseAuthCustomClaims(userRecord.uid, {
        admin: isAdminRole,
      });

      const fullName = `${firstName.trim()} ${lastName.trim()}`.toUpperCase();

      const cleanPin = String(pin || "").trim();
      if (cleanPin && (cleanPin.length !== 4 || isNaN(Number(cleanPin)))) {
        return NextResponse.json({ error: "Access PIN must be a valid 4-digit numeric code." }, { status: 400 });
      }

      // Write user document to Firestore
      await adminDb.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        name: fullName,
        firstName: firstName.trim().toUpperCase(),
        lastName: lastName.trim().toUpperCase(),
        email: cleanEmail,
        phoneNumber: cleanPhone,
        balance: Number(balance) || 0,
        bonusBalance: 0,
        role: role || "user",
        permissions: cleanPermissions,
        ...(cleanPin ? { pin: cleanPin, isPinRequired: true } : {}),
        createdAt: new Date().toISOString()
      });

      if (isAdminRole) {
        await adminDb.collection("admin_users").doc(userRecord.uid).set({
          uid: userRecord.uid,
          email: cleanEmail,
          displayName: fullName,
          phoneNumber: cleanPhone,
          role: role,
          permissions: cleanPermissions,
          status: "active",
          createdBy: uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      return NextResponse.json({
        success: true,
        message: "User created and authenticated successfully!",
        uid: userRecord.uid
      });

    } else if (action === "update") {
      const { targetUid, role, permissions } = body;

      if (!targetUid) {
        return NextResponse.json({ error: "Missing user identifier." }, { status: 400 });
      }

      // Enforce role modification privileges: Only SUPER_ADMIN can manage administrative roles/privileges
      const adminDoc = await adminDb.collection("admin_users").doc(uid).get();
      const adminData = adminDoc.exists ? adminDoc.data() || {} : {};
      const callerRole = (adminData.role || "").toLowerCase();

      const isCallerSuperAdmin = (callerRole === "super_admin" || uid === "mock-admin-uid");

      const targetDoc = await adminDb.collection("users").doc(targetUid).get();
      const targetData = targetDoc.exists ? targetDoc.data() || {} : {};
      const targetCurrentRole = targetData.role || "user";
      const isAdminRole = ["super_admin", "admin", "finance", "kyc_admin", "support", "read_only"].includes(role);
      const isTargetCurrentlyAdmin = ["super_admin", "admin", "finance", "kyc_admin", "support", "read_only"].includes(targetCurrentRole);

      if (isAdminRole || isTargetCurrentlyAdmin) {
        if (!isCallerSuperAdmin) {
          return NextResponse.json({ error: "Access denied: Only a SUPER_ADMIN can manage administrative roles or privileges." }, { status: 403 });
        }
      }

      const cleanPermissions = (permissions || []).filter((p: string) => ALLOWED_PERMISSIONS.includes(p));

      if (uid === "mock-admin-uid") {
        return NextResponse.json({
          success: true,
          message: "Mock user permissions updated successfully!"
        });
      }

      // Update Firestore user document
      await adminDb.collection("users").doc(targetUid).update({
        role: role || "user",
        permissions: cleanPermissions
      });

      if (isAdminRole) {
        await adminDb.collection("admin_users").doc(targetUid).set({
          uid: targetUid,
          email: targetData.email || "",
          displayName: targetData.name || targetData.displayName || "",
          phoneNumber: targetData.phoneNumber || "",
          role: role,
          permissions: cleanPermissions,
          status: "active",
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else if (isTargetCurrentlyAdmin) {
        await adminDb.collection("admin_users").doc(targetUid).delete();
      }

      // Update Firebase Auth Custom Claims via dependency-free REST API
      await setFirebaseAuthCustomClaims(targetUid, {
        admin: isAdminRole,
      });

      return NextResponse.json({
        success: true,
        message: "User role & permissions updated and synchronized successfully!"
      });

    } else if (action === "set_pin" || action === "update_pin") {
      const { targetUid, pin } = body;

      if (!targetUid) {
        return NextResponse.json({ error: "Missing user identifier." }, { status: 400 });
      }

      const cleanPin = String(pin || "").trim();
      if (cleanPin.length !== 4 || isNaN(Number(cleanPin))) {
        return NextResponse.json({ error: "Access PIN must be a valid 4-digit numeric code." }, { status: 400 });
      }

      if (uid === "mock-admin-uid") {
        return NextResponse.json({
          success: true,
          message: `Access PIN updated to ${cleanPin} for mock user!`
        });
      }

      const targetRef = adminDb.collection("users").doc(targetUid);
      const targetDoc = await targetRef.get();
      if (!targetDoc.exists) {
        return NextResponse.json({ error: "Target user account document not found." }, { status: 404 });
      }

      await targetRef.update({
        pin: cleanPin,
        isPinRequired: true,
        updatedAt: new Date().toISOString(),
        pinUpdatedAt: new Date().toISOString(),
        pinUpdatedBy: perm.auth?.email || uid,
      });

      return NextResponse.json({
        success: true,
        message: `4-Digit Access PIN successfully set for ${targetDoc.data()?.name || targetUid}!`,
      });

    } else {
      return NextResponse.json({ error: "Invalid action request." }, { status: 400 });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Users Post API] Error:", error.message);
    return NextResponse.json({ error: "Operation failed", details: error.message }, { status: 500 });
  }
}
