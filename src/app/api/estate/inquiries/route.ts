import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";
import { NotificationService } from "@/services/notification-service";

// Master encryption key derived from environment or secret fallback
const ENCRYPTION_SECRET = process.env.CHAT_ENCRYPTION_KEY || process.env.PAYMENT_GATEWAY_API_KEY || "e_global_estate_secure_chat_32_byte_secret_key_v1";
const ALGORITHM = "aes-256-gcm";

function getDerivedKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
}

/**
 * Encrypts sensitive chat content using AES-256-GCM.
 */
function encryptText(text: string): { encryptedData: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const key = getDerivedKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return {
    encryptedData: encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

/**
 * Decrypts AES-256-GCM encrypted chat payload.
 */
function decryptText(payload: { encryptedData?: string; iv?: string; tag?: string; raw?: string }): string {
  if (payload.raw) return payload.raw;
  if (!payload.encryptedData || !payload.iv || !payload.tag) return payload.encryptedData || "";
  try {
    const key = getDerivedKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "hex"));
    decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
    let decrypted = decipher.update(payload.encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return payload.encryptedData || "";
  }
}

/**
 * Auto-purges chat inquiries older than 30 days (720 hours).
 */
async function purgeExpiredInquiries(): Promise<number> {
  try {
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoIso = new Date(thirtyDaysAgoMs).toISOString();

    const staleSnap = await adminDb
      .collection("estate_inquiries")
      .where("createdAt", "<", thirtyDaysAgoIso)
      .limit(100)
      .get();

    if (staleSnap.empty) return 0;

    const batch = adminDb.batch();
    let count = 0;
    staleSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      count++;
    });

    await batch.commit();
    console.log(`[Estate Chat] Auto-purged ${count} expired chat inquiry record(s) older than 30 days.`);
    return count;
  } catch (err: any) {
    console.warn("[Estate Chat Purge Warning]:", err?.message);
    return 0;
  }
}

// GET /api/estate/inquiries - Fetch chat inquiries (with 30-day auto-purge)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access token required." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }

    const uid = decoded.uid;
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");

    // Trigger non-blocking 30-day auto-purge cleanup
    purgeExpiredInquiries().catch(() => {});

    let query: FirebaseFirestore.Query = adminDb.collection("estate_inquiries");

    if (propertyId) {
      query = query.where("propertyId", "==", propertyId);
    } else {
      query = query.where("sellerId", "==", uid);
    }

    const snap = await query.limit(100).get();

    const inquiries: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Only include if belonging to seller or user
      if (data.sellerId === uid || data.userId === uid) {
        const decryptedMessage = decryptText({
          encryptedData: data.encryptedMessage,
          iv: data.iv,
          tag: data.tag,
          raw: data.message,
        });

        let decryptedAudioData = data.audioData;
        if (data.encryptedAudio) {
          decryptedAudioData = decryptText({
            encryptedData: data.encryptedAudio.data,
            iv: data.encryptedAudio.iv,
            tag: data.encryptedAudio.tag,
          });
        }

        inquiries.push({
          id: docSnap.id,
          ...data,
          message: decryptedMessage,
          audioData: decryptedAudioData,
          // Expose calculated expiry timestamp for UI timer
          expiresAt: new Date(new Date(data.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    });

    // Sort by createdAt ASC for chat timeline
    inquiries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({ success: true, inquiries });
  } catch (err: any) {
    console.error("[GET /api/estate/inquiries Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch chat inquiries." }, { status: 500 });
  }
}

// POST /api/estate/inquiries - Submit an encrypted inquiry (with 30-day retention)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access token required." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }

    const uid = decoded.uid;
    const body = await req.json();

    const { propertyId, propertyTitle, sellerId, message, messageType, audioData, audioDuration, userName, userPhone, userEmail } = body;

    if (!propertyId || !sellerId || (!message && !audioData)) {
      return NextResponse.json(
        { error: "Property ID, Seller ID, and inquiry message/audio are required." },
        { status: 400 }
      );
    }

    // Read global estate marketplace communication settings for server-side enforcement
    const settingsSnap = await adminDb.collection("config").doc("estate_settings").get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const enableChat = settingsData.enableChat !== false;
    const enableVoiceNotes = settingsData.enableVoiceNotes !== false;

    if (!enableChat) {
      return NextResponse.json(
        { error: "Chat is disabled at this time" },
        { status: 403 }
      );
    }

    if (messageType === "voice" && !enableVoiceNotes) {
      return NextResponse.json(
        { error: "Voice note messaging is currently disabled by administrator settings." },
        { status: 403 }
      );
    }

    const isVoice = messageType === "voice";
    const cleanText = isVoice ? "🎤 Voice Note" : String(message || "").trim();
    const encrypted = encryptText(cleanText);

    let encryptedAudioObj = null;
    if (isVoice && audioData) {
      const encAudio = encryptText(String(audioData));
      encryptedAudioObj = {
        data: encAudio.encryptedData,
        iv: encAudio.iv,
        tag: encAudio.tag,
      };
    }

    // Non-blocking auto-purge background worker
    purgeExpiredInquiries().catch(() => {});

    const newInquiryRef = adminDb.collection("estate_inquiries").doc();
    const createdAtIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const newInquiry = {
      id: newInquiryRef.id,
      propertyId,
      propertyTitle: propertyTitle || "Property Inquiry",
      sellerId,
      userId: uid,
      userName: userName || decoded.email || "Interested Buyer/Tenant",
      userPhone: userPhone || "",
      userEmail: userEmail || decoded.email || "",
      encryptedMessage: encrypted.encryptedData,
      iv: encrypted.iv,
      tag: encrypted.tag,
      messageType: isVoice ? "voice" : "text",
      encryptedAudio: encryptedAudioObj,
      audioDuration: audioDuration ? Number(audioDuration) : 0,
      status: "NEW",
      createdAt: createdAtIso,
      expiresAt: expiresAtIso,
      autoDeleteDays: 30,
    };

    await newInquiryRef.set(newInquiry);

    // Dispatch wallet push notification to agent/seller
    try {
      await NotificationService.sendPushNotification(sellerId, {
        title: "New Estate Inquiry Chat",
        body: `New message regarding "${propertyTitle || "Property"}": "${cleanText.slice(0, 50)}..."`,
        type: "transaction",
      });
    } catch (notifErr: any) {
      console.warn("[POST /api/estate/inquiries Notification Warning]:", notifErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: "Encrypted inquiry dispatched successfully. Auto-deletes in 30 days.",
      inquiry: {
        ...newInquiry,
        message: cleanText,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/estate/inquiries Error]:", err.message);
    return NextResponse.json({ error: "Failed to submit property inquiry." }, { status: 500 });
  }
}
