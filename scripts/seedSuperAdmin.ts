import fs from "fs";
import path from "path";

// Zero-dependency .env loader for seed script
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...val] = trimmed.split("=");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    });
  }
} catch {
  // Ignore env read errors
}

import { adminDb, adminApp } from "../src/lib/firebase-admin";

const SUPER_ADMIN_EMAIL = "abdulkadir123shaba@gmail.com";

async function seedSuperAdmin() {
  console.log(`[Seed Super Admin] Provisioning Super Admin for ${SUPER_ADMIN_EMAIL}...`);

  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(adminApp);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
    console.log(`[Seed Super Admin] Found existing Firebase Auth user with UID: ${userRecord.uid}`);
  } catch (err: any) {
    console.error(`[Seed Super Admin] Firebase Auth user not found for ${SUPER_ADMIN_EMAIL}: ${err.message}`);
    console.error("Please create the Firebase user in Firebase Authentication console first.");
    process.exit(1);
  }

  const uid = userRecord.uid;
  const now = new Date().toISOString();

  const superAdminData = {
    uid,
    email: SUPER_ADMIN_EMAIL,
    displayName: userRecord.displayName || "ABDULKADIR SHABA",
    role: "super_admin",
    permissions: ["*"],
    status: "active",
    createdBy: "seed_script",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    mfaEnabled: false,
  };

  await adminDb.collection("admin_users").doc(uid).set(superAdminData, { merge: true });

  // Set Firebase Custom Claims
  try {
    await auth.setCustomUserClaims(uid, {
      admin: true,
      role: "super_admin",
    });
    console.log(`[Seed Super Admin] Set custom claims (admin: true, role: super_admin) for UID: ${uid}`);
  } catch (claimErr: any) {
    console.warn(`[Seed Super Admin] Warning setting custom claims: ${claimErr.message}`);
  }

  console.log(`✅ [Seed Super Admin] Super Admin successfully provisioned in admin_users/${uid}!`);
  process.exit(0);
}

seedSuperAdmin().catch((err) => {
  console.error("Fatal error seeding Super Admin:", err);
  process.exit(1);
});
