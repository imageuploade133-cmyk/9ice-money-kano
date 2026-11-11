import { adminDb } from "@/lib/firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

export type NotificationType = "transaction" | "security" | "promo" | "system" | "order" | "chat";

export interface NotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
  url?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  recipientName?: string;
  bankName?: string;
  channel?: string;
}

export class NotificationService {
  /**
   * Sends a push notification strictly to active tokens matching the user's authoritative active session ID,
   * and saves the notification in history.
   * @param userId The ID of the recipient user.
   * @param payload The notification content.
   */
  public static async sendPushNotification(userId: string, payload: NotificationPayload): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      // 1. Save to Firestore under user's notification subcollection
      if (adminDb) {
        try {
          const histDocId = payload.reference ? `tx-notif-${payload.reference}` : undefined;
          const notificationRef = histDocId
            ? adminDb.collection("users").doc(userId).collection("notifications").doc(histDocId)
            : adminDb.collection("users").doc(userId).collection("notifications").doc();

          await notificationRef.set({
            title: payload.title,
            body: payload.body,
            message: payload.body, // compatibility fallback
            type: payload.type,
            read: false,
            createdAt: now,
            url: payload.url || "",
            amount: payload.amount !== undefined ? payload.amount : null,
            currency: payload.currency || "NGN",
            reference: payload.reference || "",
            recipientName: payload.recipientName || "",
            bankName: payload.bankName || "",
            channel: payload.channel || "",
          }, { merge: true });
          console.log(`[NotificationService] Saved notification history for user=${userId} | docId=${notificationRef.id}`);
        } catch (fsErr: any) {
          console.error(`[NotificationService Error] Failed to save history for user=${userId}:`, fsErr.message);
        }
      }

      if (!adminDb) {
        console.warn(`[NotificationService Warning] adminDb not initialized. Skipping FCM dispatch.`);
        return false;
      }

      // 2. Resolve current active session and fetch target FCM tokens matching active session ID ONLY
      const userSnap = await adminDb.collection("users").doc(userId).get();
      const activeSessionId = userSnap.exists ? String(userSnap.data()?.activeSessionId || "") : "";

      if (!activeSessionId) {
        console.log(`[NotificationService] No active session for user=${userId}; skipping FCM dispatch.`);
        return false;
      }

      let tokensSnapshot = await adminDb.collection("fcm_tokens")
        .where("userId", "==", userId)
        .where("sessionId", "==", activeSessionId)
        .get();

      // Fallback: If no tokens carry sessionId yet, check tokens for user where sessionId is missing/empty
      if (tokensSnapshot.empty) {
        const fallbackSnap = await adminDb.collection("fcm_tokens")
          .where("userId", "==", userId)
          .get();

        const validFallbackDocs = fallbackSnap.docs.filter(docSnap => {
          const d = docSnap.data();
          return !d.sessionId || d.sessionId === activeSessionId;
        });

        if (validFallbackDocs.length === 0) {
          console.log(`[NotificationService] No active FCM tokens registered for user=${userId} with activeSessionId=${activeSessionId}`);
          return false;
        }

        tokensSnapshot = {
          empty: false,
          forEach: (callback: (doc: any) => void) => validFallbackDocs.forEach(callback),
        } as any;
      }

      const tokensList: { id: string; token: string; platform: string }[] = [];
      tokensSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.token) {
          tokensList.push({
            id: docSnap.id,
            token: data.token,
            platform: data.platform || "web",
          });

          // Auto-fix missing sessionId on document if activeSessionId is known
          if (activeSessionId && !data.sessionId && docSnap.ref && typeof docSnap.ref.update === "function") {
            docSnap.ref.update({ sessionId: activeSessionId }).catch(() => {});
          }
        }
      });

      console.log(`[NotificationService] Found ${tokensList.length} FCM token(s) for user=${userId}`);

      // 3. Send notifications via FCM with channelId and APNs alert payload
      const messaging = getMessaging();
      const tokensToDelete: string[] = [];
      let sentCount = 0;

      for (const t of tokensList) {
        try {
          const message = {
            token: t.token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              title: payload.title,
              body: payload.body,
              type: payload.type,
              url: payload.reference ? `/?txRef=${payload.reference}` : (payload.url || ""),
              click_action: payload.reference ? `/?txRef=${payload.reference}` : (payload.url || ""),
              reference: payload.reference || "",
              transactionReference: payload.reference || "",
              txRef: payload.reference || "",
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
                    title: payload.title,
                    body: payload.body,
                  },
                  sound: "default",
                  badge: 1,
                },
              },
            },
            webpush: {
              headers: {
                Urgency: "high",
              },
              notification: {
                icon: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
                badge: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
              },
            },
          };

          const fcmResponse = await messaging.send(message);
          sentCount += 1;
          console.log(`[NotificationService] Push successfully dispatched to platform=${t.platform} | fcmId=${fcmResponse}`);
        } catch (fcmErr: any) {
          const errMsg = fcmErr.message || "";
          console.warn(`[NotificationService Warning] Failed to send push to token=${t.id}:`, errMsg);

          const isInvalidToken =
            fcmErr.code === "messaging/invalid-registration-token" ||
            fcmErr.code === "messaging/registration-token-not-registered" ||
            errMsg.includes("registration-token-not-registered") ||
            errMsg.includes("invalid-registration-token") ||
            errMsg.includes("InvalidRegistration") ||
            errMsg.includes("NotRegistered");

          if (isInvalidToken) {
            tokensToDelete.push(t.id);
          }
        }
      }

      // Clean up invalid tokens
      if (tokensToDelete.length > 0 && adminDb) {
        const db = adminDb;
        const batch = db.batch();
        tokensToDelete.forEach((tokenId) => {
          batch.delete(db.collection("fcm_tokens").doc(tokenId));
        });
        await batch.commit().catch((bErr) => console.error("[NotificationService] Token cleanup error:", bErr.message));
        console.log(`[NotificationService] Automatically deleted ${tokensToDelete.length} invalid/expired FCM token(s).`);
      }

      return sentCount > 0;
    } catch (err: any) {
      console.error(`[NotificationService Exception] Failed to execute notification dispatch:`, err.message);
      return false;
    }
  }

  /**
   * Sends one idempotent push notification for a completed reversal/refund.
   * The reversal transaction is already persisted before this method is called.
   */
  public static async sendReversalNotification(params: {
    userId: string;
    reference: string;
    originalReference?: string;
    amount: number;
    currency?: string;
    transactionLabel: string;
    recipientName?: string;
  }): Promise<void> {
    if (!adminDb || !params.userId || !params.reference || params.amount <= 0) return;

    const transactionReversalRef = adminDb.collection("transactions").doc(`tx-${params.reference}`);
    const investmentReversalRef = adminDb.collection("investmentTransactions").doc(`tx-${params.reference}`);
    let reversalRef = transactionReversalRef;
    const now = Date.now();
    let shouldDispatch = false;

    try {
      await adminDb.runTransaction(async (transaction) => {
        let snap = await transaction.get(transactionReversalRef);
        if (!snap.exists) {
          snap = await transaction.get(investmentReversalRef);
          if (snap.exists) reversalRef = investmentReversalRef;
        }
        if (!snap.exists) return;

        const data = snap.data() || {};
        if (data.reversalNotificationStatus === "SENT") return;

        const leaseExpiresAt = Number(data.reversalNotificationLeaseExpiresAt || 0);
        if (data.reversalNotificationStatus === "PROCESSING" && leaseExpiresAt > now) return;

        transaction.set(reversalRef, {
          reversalNotificationStatus: "PROCESSING",
          reversalNotificationLeaseExpiresAt: now + 60_000,
          reversalNotificationLastAttemptAt: new Date(now).toISOString(),
        }, { merge: true });
        shouldDispatch = true;
      });

      if (!shouldDispatch) return;

      const currency = params.currency || "NGN";
      const formattedAmount = params.amount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      const delivered = await this.sendPushNotification(params.userId, {
        title: "🔄 Transaction Reversed",
        body: `Your ${params.transactionLabel} has been reversed. ₦${formattedAmount} has been refunded to your wallet.`,
        type: "transaction",
        url: "/history",
        amount: params.amount,
        currency,
        reference: params.reference,
        recipientName: params.recipientName || "Wallet",
        channel: "Reversal",
      });

      if (!delivered) {
        await reversalRef.set({
          reversalNotificationStatus: "FAILED",
          reversalNotificationLeaseExpiresAt: null,
          reversalNotificationLastError: "No FCM token accepted the reversal notification",
        }, { merge: true });
        return;
      }

      await reversalRef.set({
        reversalNotificationStatus: "SENT",
        reversalNotificationSentAt: new Date().toISOString(),
        reversalNotificationLeaseExpiresAt: null,
        reversalNotificationOriginalReference: params.originalReference || "",
      }, { merge: true });
    } catch (err: any) {
      try {
        await reversalRef.set({
          reversalNotificationStatus: "FAILED",
          reversalNotificationLeaseExpiresAt: null,
          reversalNotificationLastError: String(err?.message || "Notification dispatch failed").slice(0, 500),
        }, { merge: true });
      } catch {
        // Notification failure must never affect the financial transaction.
      }
      console.error("[NotificationService] Reversal notification dispatch failed:", err?.message || err);
    }
  }

  /**
   * Broadcasts a real-time FCM push notification to all active users when an administrator releases a new app version.
   */
  public static async broadcastAppUpdateNotification(newVersion: string): Promise<number> {
    if (!adminDb) return 0;
    try {
      const tokensSnap = await adminDb.collection("fcm_tokens").get();
      if (tokensSnap.empty) return 0;

      const title = "🚀 New Update Available!";
      const body = `Version ${newVersion} has been released. Tap to update now for new features and performance enhancements!`;

      const messaging = getMessaging();
      const tokenDocs = tokensSnap.docs
        .map(docSnap => {
          const data = docSnap.data() as { token?: string; userId?: string; [key: string]: any };
          return { id: docSnap.id, ...data };
        })
        .filter(t => Boolean(t.token));

      if (tokenDocs.length === 0) return 0;

      let sentCount = 0;
      const invalidTokenIds: string[] = [];
      const affectedUserIds = new Set<string>();

      // Dispatch FCM push messages concurrently using Promise.allSettled
      const sendPromises = tokenDocs.map(async (tDoc) => {
        try {
          const message = {
            token: tDoc.token!,
            notification: { title, body },
            data: {
              title,
              body,
              type: "system",
              version: newVersion,
              url: "/",
            },
            android: {
              priority: "high" as const,
              notification: {
                sound: "default",
                channelId: "eglobal_wallet_high_channel",
              },
            },
            apns: {
              payload: {
                aps: {
                  alert: { title, body },
                  sound: "default",
                  badge: 1,
                },
              },
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                icon: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
                badge: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
              },
            },
          };

          await messaging.send(message);
          sentCount++;
          if (tDoc.userId) affectedUserIds.add(tDoc.userId);
        } catch (fcmErr: any) {
          const errMsg = fcmErr.message || "";
          if (
            fcmErr.code === "messaging/invalid-registration-token" ||
            fcmErr.code === "messaging/registration-token-not-registered" ||
            errMsg.includes("not-registered") ||
            errMsg.includes("invalid-registration-token")
          ) {
            invalidTokenIds.push(tDoc.id);
          }
        }
      });

      await Promise.allSettled(sendPromises);

      // Save notification to affected user notification inboxes
      if (affectedUserIds.size > 0 && adminDb) {
        const nowIso = new Date().toISOString();
        const savePromises = Array.from(affectedUserIds).map((uid) => {
          return adminDb!
            .collection("users")
            .doc(uid)
            .collection("notifications")
            .doc(`app-update-${newVersion}`)
            .set({
              title,
              body,
              message: body,
              type: "system",
              read: false,
              createdAt: nowIso,
              version: newVersion,
            }, { merge: true })
            .catch(() => {});
        });
        await Promise.allSettled(savePromises);
      }

      if (invalidTokenIds.length > 0 && adminDb) {
        const batch = adminDb.batch();
        invalidTokenIds.forEach(id => batch.delete(adminDb!.collection("fcm_tokens").doc(id)));
        await batch.commit().catch(() => {});
      }

      console.log(`[NotificationService] App update v${newVersion} push notification broadcasted to ${sentCount} device(s).`);
      return sentCount;
    } catch (err: any) {
      console.error("[NotificationService] Failed to broadcast app update notification:", err.message);
      return 0;
    }
  }

  /**
   * Broadcasts an administrative push notification (with optional banner image URL, action URL, and type)
   * to all active tokens or a specific target user, saving the notification in user inboxes and returning send metrics.
   */
  public static async sendAdminBroadcastNotification(params: {
    target: "all" | "user";
    targetUserId?: string;
    title: string;
    body: string;
    type?: NotificationType;
    imageUrl?: string;
    url?: string;
    adminEmail?: string;
  }): Promise<{ sentCount: number; targetCount: number; errorsCount: number }> {
    if (!adminDb) return { sentCount: 0, targetCount: 0, errorsCount: 0 };

    try {
      const { target, targetUserId, title, body, type = "promo", imageUrl = "", url = "", adminEmail = "" } = params;

      let tokenDocs: { id: string; token: string; userId?: string }[] = [];

      if (target === "user" && targetUserId) {
        const snap = await adminDb.collection("fcm_tokens").where("userId", "==", targetUserId).get();
        tokenDocs = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as { token?: string; userId?: string }) }))
          .filter(t => Boolean(t.token)) as any;
      } else {
        const snap = await adminDb.collection("fcm_tokens").get();
        tokenDocs = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as { token?: string; userId?: string }) }))
          .filter(t => Boolean(t.token)) as any;
      }

      if (tokenDocs.length === 0) {
        return { sentCount: 0, targetCount: 0, errorsCount: 0 };
      }

      const messaging = getMessaging();
      let sentCount = 0;
      let errorsCount = 0;
      const invalidTokenIds: string[] = [];
      const affectedUserIds = new Set<string>();

      const sendPromises = tokenDocs.map(async (tDoc) => {
        try {
          const message = {
            token: tDoc.token,
            notification: {
              title,
              body,
              ...(imageUrl ? { image: imageUrl } : {}),
            },
            data: {
              title,
              body,
              type,
              image: imageUrl,
              imageUrl,
              bannerUrl: imageUrl,
              url: url || "/",
              click_action: url || "/",
            },
            android: {
              priority: "high" as const,
              notification: {
                sound: "default",
                channelId: "eglobal_wallet_high_channel",
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                ...(imageUrl ? { imageUrl } : {}),
              },
            },
            apns: {
              payload: {
                aps: {
                  alert: { title, body },
                  sound: "default",
                  badge: 1,
                  ...(imageUrl ? { "mutable-content": 1 } : {}),
                },
              },
              ...(imageUrl ? { fcm_options: { image: imageUrl } } : {}),
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                icon: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
                badge: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
                ...(imageUrl ? { image: imageUrl } : {}),
              },
              fcmOptions: {
                ...(url ? { link: url } : {}),
              },
            },
          };

          await messaging.send(message);
          sentCount++;
          if (tDoc.userId) affectedUserIds.add(tDoc.userId);
        } catch (fcmErr: any) {
          errorsCount++;
          const errMsg = fcmErr.message || "";
          if (
            fcmErr.code === "messaging/invalid-registration-token" ||
            fcmErr.code === "messaging/registration-token-not-registered" ||
            errMsg.includes("not-registered") ||
            errMsg.includes("invalid-registration-token")
          ) {
            invalidTokenIds.push(tDoc.id);
          }
        }
      });

      await Promise.allSettled(sendPromises);

      // Save notification to affected user notification inboxes in Firestore
      if (affectedUserIds.size > 0 && adminDb) {
        const nowIso = new Date().toISOString();
        const savePromises = Array.from(affectedUserIds).map((uid) => {
          return adminDb!
            .collection("users")
            .doc(uid)
            .collection("notifications")
            .doc()
            .set({
              title,
              body,
              message: body,
              type,
              read: false,
              createdAt: nowIso,
              imageUrl,
              bannerUrl: imageUrl,
              url,
            })
            .catch(() => {});
        });
        await Promise.allSettled(savePromises);
      }

      // Cleanup invalid tokens
      if (invalidTokenIds.length > 0 && adminDb) {
        const batch = adminDb.batch();
        invalidTokenIds.forEach(id => batch.delete(adminDb!.collection("fcm_tokens").doc(id)));
        await batch.commit().catch(() => {});
      }

      // Record audit entry in admin_push_notifications
      const logRef = adminDb.collection("admin_push_notifications").doc();
      await logRef.set({
        id: logRef.id,
        title,
        body,
        type,
        imageUrl,
        url,
        target,
        targetUserId: targetUserId || null,
        sentCount,
        errorsCount,
        targetCount: tokenDocs.length,
        adminEmail,
        createdAt: new Date().toISOString(),
      });

      return { sentCount, targetCount: tokenDocs.length, errorsCount };
    } catch (err: any) {
      console.error("[NotificationService] Admin push broadcast failed:", err.message);
      return { sentCount: 0, targetCount: 0, errorsCount: 1 };
    }
  }
}
