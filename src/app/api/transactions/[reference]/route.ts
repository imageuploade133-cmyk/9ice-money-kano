import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  req: Request,
  context: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await context.params;
    if (!reference || typeof reference !== "string") {
      return NextResponse.json(
        { error: "Transaction reference is required." },
        { status: 400 }
      );
    }

    // 1. Mandatory Server-Side Authentication
    let uid = "";
    try {
      const authResult = await authenticateUserRequest(req);
      uid = authResult.uid;
    } catch (authErr: any) {
      console.error("[Transactions Route] Authentication failed:", authErr.message);
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing token." },
        { status: 401 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: "Database service unavailable." },
        { status: 500 }
      );
    }

    const cleanRef = reference.trim();

    // Validate safe transaction reference format (alphanumeric, hyphens, underscores)
    if (!/^[A-Za-z0-9_\-]+$/.test(cleanRef) || cleanRef.length > 128) {
      return NextResponse.json(
        { error: "Invalid or malformed transaction reference." },
        { status: 400 }
      );
    }

    // 2. Fetch target transaction document from Firestore
    let docData: any = null;
    let docId = "";

    // Try direct document ID lookup
    const directDoc = await adminDb.collection("transactions").doc(cleanRef).get();
    if (directDoc.exists) {
      docData = directDoc.data();
      docId = directDoc.id;
    } else {
      // Try doc ID with 'tx-' prefix
      const txPrefixedDoc = await adminDb.collection("transactions").doc(`tx-${cleanRef}`).get();
      if (txPrefixedDoc.exists) {
        docData = txPrefixedDoc.data();
        docId = txPrefixedDoc.id;
      } else {
        // Query by reference field
        const querySnap = await adminDb
          .collection("transactions")
          .where("reference", "==", cleanRef)
          .limit(1)
          .get();

        if (!querySnap.empty) {
          const matchedDoc = querySnap.docs[0];
          docData = matchedDoc.data();
          docId = matchedDoc.id;
        }
      }
    }

    if (!docData) {
      return NextResponse.json(
        { error: "Transaction not found." },
        { status: 404 }
      );
    }

    // 3. MANDATORY STRICT SERVER-SIDE UID AUTHORIZATION CHECK
    // Authorization MUST be based strictly on an explicit trusted UID relationship.
    // Phone numbers, customer IDs, recipient names, or text matching are NEVER independent proof of ownership.
    let isAuthorized = false;

    // Direct owner check
    if (docData.userId && typeof docData.userId === "string" && docData.userId === uid) {
      isAuthorized = true;
    }

    // Recipient user check
    if (!isAuthorized && docData.recipientUserId && typeof docData.recipientUserId === "string" && docData.recipientUserId === uid) {
      isAuthorized = true;
    }

    // Explicit metadata UID checks
    const meta = docData.metadata || {};
    if (!isAuthorized && typeof meta === "object") {
      if (meta.recipientUserId === uid || meta.senderUserId === uid || meta.userId === uid) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      console.warn(`[Transactions Authorization Denied] User uid=${uid} attempted to access transaction ${cleanRef} belonging to userId=${docData.userId}`);
      return NextResponse.json(
        { error: "You are not authorized to view this transaction." },
        { status: 403 }
      );
    }

    // 4. Return canonical authorized transaction record
    const formattedTransaction = {
      ...docData,
      id: docId,
      reference: docData.reference || cleanRef,
      type: docData.type || "DEPOSIT",
      amount: Number(docData.amount) || 0,
      currency: docData.currency || "NGN",
      description: docData.description || "",
      recipientName: docData.recipientName || "",
      bankName: docData.bankName || "",
      status: docData.status || "PENDING",
      date: docData.date || "",
      time: docData.time || "",
      fee: Number(docData.fee) || 0,
      vat: Number(docData.vat) || 0,
      markup: Number(docData.markup) || 0,
      totalDebited: docData.totalDebited !== undefined && docData.totalDebited !== null ? Number(docData.totalDebited) : undefined,
      totalCredited: docData.totalCredited !== undefined && docData.totalCredited !== null ? Number(docData.totalCredited) : undefined,
    };

    return NextResponse.json({
      success: true,
      transaction: formattedTransaction,
    });
  } catch (err: any) {
    console.error("[Transactions Route Exception]:", err.message);
    return NextResponse.json(
      { error: "Failed to fetch transaction details." },
      { status: 500 }
    );
  }
}
