import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

// GET: Fetch public (non-hidden) reviews for a product
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ error: "Product ID parameter is required." }, { status: 400 });
    }

    const reviewsSnap = await adminDb
      .collection("store_reviews")
      .where("productId", "==", productId)
      .where("isHidden", "==", false)
      .get();

    const reviews = reviewsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort descending by createdAt
    reviews.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, reviews });
  } catch (err: any) {
    console.error("[Public Store Reviews GET Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch reviews.", details: err.message }, { status: 500 });
  }
}

// POST: Submit a new customer review for a product
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, authorName, rating, comment } = body;

    if (!productId || !comment || !comment.trim()) {
      return NextResponse.json({ error: "Product ID and comment content are required." }, { status: 400 });
    }

    const numericRating = Math.min(5, Math.max(1, parseInt(rating) || 5));

    const newReview = {
      productId,
      authorName: (authorName || "Verified Customer").trim(),
      rating: numericRating,
      comment: comment.trim(),
      adminReply: null,
      isHidden: false,
      createdAt: new Date().toISOString(),
    };

    const docRef = await adminDb.collection("store_reviews").add(newReview);

    return NextResponse.json({
      success: true,
      message: "Review submitted successfully!",
      review: { id: docRef.id, ...newReview },
    });
  } catch (err: any) {
    console.error("[Public Store Reviews POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to submit review.", details: err.message }, { status: 500 });
  }
}
