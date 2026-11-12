import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET /api/estate/admin/inquiries - Group inquiry chat threads by agent & customer
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.view");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    let queryRef: FirebaseFirestore.Query = adminDb.collection("estate_inquiries");

    if (agentId) {
      queryRef = queryRef.where("sellerId", "==", agentId);
    }

    const snap = await queryRef.limit(200).get();
    const rawInquiries: any[] = [];

    snap.forEach((docSnap) => {
      rawInquiries.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort by timestamp descending
    rawInquiries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Group inquiries into conversation threads by propertyId + userId
    const threadsMap = new Map<string, any>();

    for (const inq of rawInquiries) {
      const threadKey = `${inq.propertyId}_${inq.userId}`;
      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, {
          threadKey,
          propertyId: inq.propertyId,
          propertyTitle: inq.propertyTitle || "Property Listing",
          sellerId: inq.sellerId,
          userId: inq.userId,
          userName: inq.userName || "Customer",
          userPhone: inq.userPhone || "",
          userEmail: inq.userEmail || "",
          lastMessage: inq.message || "🎤 Voice Note",
          lastMessageType: inq.messageType || "text",
          lastMessageTime: inq.createdAt,
          messages: [],
        });
      }

      const thread = threadsMap.get(threadKey);
      thread.messages.push({
        id: inq.id,
        senderId: inq.userId,
        senderName: inq.userName,
        message: inq.message,
        messageType: inq.messageType || "text",
        audioData: inq.audioData || null,
        audioDuration: inq.audioDuration || 0,
        createdAt: inq.createdAt,
      });
    }

    const threads = Array.from(threadsMap.values());

    return NextResponse.json({
      success: true,
      threads,
      totalInquiries: rawInquiries.length,
    });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/inquiries Error]:", err.message);
    return NextResponse.json({ error: "Failed to audit customer inquiries." }, { status: 500 });
  }
}
