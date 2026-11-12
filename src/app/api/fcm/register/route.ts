import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

export async function POST(req: Request) {
  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { token, platform } = body;

    if (!token) {
      return NextResponse.json({ error: "FCM token is required." }, { status: 400 });
    }

    // Resolve server-authoritative active session ID directly from Firestore users/{uid}
    let authoritativeSessionId: string | null = null;
    const providedSessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || body?.sessionId || "";

    if (process.env.NODE_ENV !== "production" && (uid === "mock-uid" || uid === "mock-admin-uid")) {
      authoritativeSessionId = "mock-session-id";
    } else {
      try {
        const userDoc = await adminDb.collection("users").doc(uid).get();
        if (userDoc.exists) {
          authoritativeSessionId = userDoc.data()?.activeSessionId || providedSessionId || null;
        } else {
          authoritativeSessionId = providedSessionId || null;
        }
      } catch (docErr: any) {
        console.error(`[FCM API Error] Failed to fetch active session for user ${uid}:`, docErr.message);
        authoritativeSessionId = providedSessionId || null;
      }
    }

    const sessionIdToStore = authoritativeSessionId || providedSessionId || null;

    const cleanToken = token.trim();
    const tokenDocId = `${uid}_${Buffer.from(cleanToken).toString("base64").slice(0, 100)}`; // Safe, uniform composite key
    const tokenRef = adminDb.collection("fcm_tokens").doc(tokenDocId);

    const now = new Date().toISOString();

    await tokenRef.set({
      userId: uid,
      token: cleanToken,
      platform: platform || "web",
      ...(sessionIdToStore ? { sessionId: sessionIdToStore } : {}),
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // Purge any tokens belonging to old superseded sessions so old devices NEVER receive pushes
    if (sessionIdToStore) {
      try {
        const oldTokensSnap = await adminDb.collection("fcm_tokens")
          .where("userId", "==", uid)
          .get();
        if (!oldTokensSnap.empty) {
          const batch = adminDb.batch();
          let deletedCount = 0;
          oldTokensSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (docSnap.id !== tokenDocId && data.sessionId && data.sessionId !== sessionIdToStore) {
              batch.delete(docSnap.ref);
              deletedCount++;
            }
          });
          if (deletedCount > 0) {
            await batch.commit();
            console.log(`[FCM API] Purged ${deletedCount} superseded token(s) for user ${uid}`);
          }
        }
      } catch (purgeErr: any) {
        console.warn("[FCM API] Superseded token purge warning:", purgeErr.message);
      }
    }

    // If this session was just authorized as a new device, deliver the security alert
    // specifically to the newly registered token, then consume the one-time marker.
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const pendingSessionId = userSnap.exists ? userSnap.data()?.pendingNewDevicePushSessionId : null;
    if (pendingSessionId && (pendingSessionId === sessionIdToStore || !sessionIdToStore)) {
      try {
        await getMessaging().send({
          token: cleanToken,
          notification: {
            title: "New Device Login",
            body: "Your E-Global Pay account was successfully signed in on this device.",
          },
          data: {
            title: "New Device Login",
            body: "Your E-Global Pay account was successfully signed in on this device.",
            type: "security",
            event: "new_device_login",
          },
          android: {
            priority: "high" as const,
            notification: {
              sound: "default",
              channelId: "eglobal_wallet_high_channel",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: "New Device Login",
                  body: "Your E-Global Pay account was successfully signed in on this device.",
                },
                sound: "default",
                badge: 1,
              },
            },
          },
        });
        await userRef.update({ pendingNewDevicePushSessionId: null });
        console.log(`[FCM API] Successfully dispatched New Device Login push to user ${uid}`);
      } catch (pushErr: any) {
        console.error("[FCM API] New-device push dispatch failed:", pushErr.message);
      }
    }

    console.log(`[FCM API] Registered token for user ${uid}. Token ID: ${tokenDocId}`);

    return NextResponse.json({ success: true, message: "FCM Token registered successfully." });

  } catch (err: any) {
    console.error("[FCM API Exception] Register failed:", err.message);
    return NextResponse.json({ error: "Internal processing error." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "FCM token is required." }, { status: 400 });
    }

    const cleanToken = token.trim();
    const tokenDocId = `${uid}_${Buffer.from(cleanToken).toString("base64").slice(0, 100)}`;
    const tokenRef = adminDb.collection("fcm_tokens").doc(tokenDocId);

    await tokenRef.delete();

    console.log(`[FCM API] Unregistered token for user ${uid}. Token ID: ${tokenDocId}`);

    return NextResponse.json({ success: true, message: "FCM Token unregistered successfully." });

  } catch (err: any) {
    console.error("[FCM API Exception] Unregister failed:", err.message);
    return NextResponse.json({ error: "Internal processing error." }, { status: 500 });
  }
}
