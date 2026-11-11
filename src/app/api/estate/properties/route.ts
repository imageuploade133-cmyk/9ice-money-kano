import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";
import { EstateProperty, DEFAULT_ESTATE_SETTINGS } from "@/estate/types";

// GET /api/estate/properties - Public & Authenticated search/filter properties
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const purpose = searchParams.get("purpose");
    const type = searchParams.get("type");
    const city = searchParams.get("city");
    const queryStr = searchParams.get("query");
    const sellerId = searchParams.get("sellerId");
    const featured = searchParams.get("featured");

    let queryRef: FirebaseFirestore.Query = adminDb.collection("estate_properties");

    // Filter by sellerId or status
    if (sellerId) {
      queryRef = queryRef.where("sellerId", "==", sellerId);
    } else {
      // Public directory shows PUBLISHED or APPROVED properties
      queryRef = queryRef.where("status", "in", ["PUBLISHED", "APPROVED"]);
    }

    if (purpose) {
      queryRef = queryRef.where("purpose", "==", purpose);
    }
    if (type) {
      queryRef = queryRef.where("propertyType", "==", type);
    }
    if (featured === "true") {
      queryRef = queryRef.where("featured", "==", true);
    }

    const snap = await queryRef.limit(100).get();
    let properties: EstateProperty[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      properties.push({
        id: docSnap.id,
        sellerId: data.sellerId || "",
        sellerName: data.sellerName || "",
        sellerPhone: data.sellerPhone || "",
        sellerEmail: data.sellerEmail || "",
        sellerAvatarUrl: data.sellerAvatarUrl || "",
        title: data.title || "",
        description: data.description || "",
        purpose: data.purpose || "Rent",
        propertyType: data.propertyType || "Apartment",
        price: Number(data.price) || 0,
        currency: data.currency || "NGN",
        pricePeriod: data.pricePeriod || "year",
        location: data.location || { address: "", city: "", state: "" },
        bedrooms: data.bedrooms ? Number(data.bedrooms) : undefined,
        bathrooms: data.bathrooms ? Number(data.bathrooms) : undefined,
        toilets: data.toilets ? Number(data.toilets) : undefined,
        propertySize: data.propertySize || "",
        furnished: data.furnished || undefined,
        amenities: Array.isArray(data.amenities) ? data.amenities : [],
        images: Array.isArray(data.images) ? data.images : [],
        videos: Array.isArray(data.videos) ? data.videos : [],
        status: data.status || "PUBLISHED",
        verificationStatus: data.verificationStatus || "PENDING",
        featured: !!data.featured,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        publishedAt: data.publishedAt || undefined,
      });
    });

    // Client-side text filter for search query or city if needed
    if (city) {
      const cityLower = city.toLowerCase();
      properties = properties.filter((p) => (p.location?.city || "").toLowerCase().includes(cityLower));
    }
    if (queryStr) {
      const qLower = queryStr.toLowerCase();
      properties = properties.filter(
        (p) =>
          p.title.toLowerCase().includes(qLower) ||
          p.description.toLowerCase().includes(qLower) ||
          (p.location?.address || "").toLowerCase().includes(qLower) ||
          (p.location?.city || "").toLowerCase().includes(qLower)
      );
    }

    return NextResponse.json({
      success: true,
      properties,
    });
  } catch (err: any) {
    console.error("[GET /api/estate/properties Error]:", err.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch property directory.",
      },
      { status: 500 }
    );
  }
}

// POST /api/estate/properties - Authenticated Sellers Create / Submit Listing
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

    const {
      id,
      propertyId,
      title,
      description,
      purpose,
      propertyType,
      price,
      pricePeriod,
      location,
      bedrooms,
      bathrooms,
      toilets,
      propertySize,
      furnished,
      amenities,
      images,
      videos,
      status, // DRAFT, PENDING_REVIEW, or PUBLISHED
    } = body;

    if (!title || !description || !purpose || !propertyType || !price || !location?.address) {
      return NextResponse.json(
        { error: "Missing required property fields (title, description, purpose, propertyType, price, address)." },
        { status: 400 }
      );
    }

    // Read marketplace settings for max title length check
    const settingsDocSnap = await adminDb.collection("config").doc("estate_settings").get();
    const activeSettings = settingsDocSnap.exists
      ? { ...DEFAULT_ESTATE_SETTINGS, ...settingsDocSnap.data() }
      : DEFAULT_ESTATE_SETTINGS;

    const maxTitleLengthAllowed = Number(activeSettings.maxTitleLength) || 100;
    const cleanTitle = String(title).trim();

    if (cleanTitle.length > maxTitleLengthAllowed) {
      return NextResponse.json(
        {
          error: `Property title exceeds the maximum allowed length of ${maxTitleLengthAllowed} characters. Please shorten the title.`,
        },
        { status: 400 }
      );
    }

    // Verify user profile & KYC Status
    const userDocRef = adminDb.collection("users").doc(uid);
    const userDocSnap = await userDocRef.get();
    const userData = userDocSnap.data() || {};

    const sellerDocRef = adminDb.collection("estate_sellers").doc(uid);
    const sellerDoc = await sellerDocRef.get();
    const sellerData = sellerDoc.data() || {};

    // Strictly enforce approved KYC identity verification for publishing
    const isKycApproved =
      userData.kycStatus === "APPROVED" ||
      userData.kycStatus === "VERIFIED" ||
      sellerData.isVerified ||
      sellerData.verificationStatus === "VERIFIED";

    if (!isKycApproved) {
      return NextResponse.json(
        {
          error:
            "KYC Identity Verification Required: Only agents with approved identity verification can publish property listings.",
        },
        { status: 403 }
      );
    }

    // Check if banned from publishing
    if (sellerData.bannedFromPublishing) {
      return NextResponse.json(
        {
          error: `Publishing Restricted: ${
            sellerData.banReason || "Your account has been banned from publishing properties."
          }`,
        },
        { status: 403 }
      );
    }

    // Check timed publishing restriction
    if (sellerData.publishingRestricted && sellerData.restrictedUntil) {
      const restrictedUntilTime = new Date(sellerData.restrictedUntil).getTime();
      const nowTime = Date.now();

      if (nowTime < restrictedUntilTime) {
        return NextResponse.json(
          {
            error: `Your publishing privileges are temporarily restricted until ${new Date(
              sellerData.restrictedUntil
            ).toLocaleString()}.`,
          },
          { status: 403 }
        );
      } else {
        // Auto-unrestrict expired publishing restriction
        await sellerDocRef.update({
          publishingRestricted: false,
          restrictedUntil: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const targetDocId = id || propertyId;
    const nowIso = new Date().toISOString();

    if (targetDocId) {
      // Edit Existing Property
      const propDocRef = adminDb.collection("estate_properties").doc(targetDocId);
      const propSnap = await propDocRef.get();

      if (!propSnap.exists) {
        return NextResponse.json({ error: "Property listing not found." }, { status: 404 });
      }

      const existingData = propSnap.data() || {};
      if (existingData.sellerId !== uid) {
        return NextResponse.json({ error: "You are not authorized to edit this property." }, { status: 403 });
      }

      // Determine status based on autoApproveListings setting and requested status
      const autoApprove = activeSettings.autoApproveListings === true;
      let finalStatus = existingData.status;

      if (status === "DRAFT") {
        finalStatus = "DRAFT";
      } else if (existingData.status === "DRAFT" || existingData.status === "REJECTED") {
        finalStatus = autoApprove ? "PUBLISHED" : "PENDING_REVIEW";
      } else if (existingData.status === "PUBLISHED" || existingData.status === "APPROVED") {
        finalStatus = autoApprove ? "PUBLISHED" : "PENDING_REVIEW";
      } else if (status === "PENDING_REVIEW") {
        finalStatus = "PENDING_REVIEW";
      }

      const updatedPayload = {
        title: String(title).trim(),
        description: String(description).trim(),
        purpose: purpose,
        propertyType: propertyType,
        price: Number(price) || 0,
        currency: "NGN",
        pricePeriod: purpose === "Sale" ? "None" : pricePeriod || "year",
        location: {
          address: String(location.address).trim(),
          city: String(location.city || "").trim(),
          state: String(location.state || "").trim(),
        },
        bedrooms: bedrooms ? Number(bedrooms) : 0,
        bathrooms: bathrooms ? Number(bathrooms) : 0,
        toilets: toilets ? Number(toilets) : 0,
        propertySize: propertySize || "",
        furnished: furnished || "Unfurnished",
        amenities: Array.isArray(amenities) ? amenities : [],
        images: Array.isArray(images) ? images : [],
        videos: Array.isArray(videos) ? videos : [],
        status: finalStatus,
        updatedAt: nowIso,
      };

      await propDocRef.set(updatedPayload, { merge: true });

      // Overwrite/upsert Admin Property Edit Snapshot Log keyed by targetDocId (propertyId) to prevent separate audit documents and reduce reads
      if (existingData.status === "PUBLISHED" || existingData.status === "APPROVED") {
        const editLogRef = adminDb.collection("estate_property_edits").doc(targetDocId);
        const existingEditSnap = await editLogRef.get();
        const existingEditData = existingEditSnap.exists ? existingEditSnap.data() || {} : {};
        const originalPreviousData = existingEditData.previousData || existingData;

        await editLogRef.set({
          id: targetDocId,
          propertyId: targetDocId,
          sellerId: uid,
          sellerName: sellerData.agencyName || sellerData.displayName || "Agent",
          propertyTitle: String(title).trim(),
          previousData: originalPreviousData,
          newData: updatedPayload,
          status: "PENDING_REVIEW",
          createdAt: existingEditData.createdAt || nowIso,
          updatedAt: nowIso,
        });
      }

      const editMessage =
        existingData.status === "DRAFT"
          ? finalStatus === "DRAFT"
            ? "Draft listing saved."
            : "Draft listing submitted for admin approval!"
          : "Property listing edits saved and submitted for review!";

      return NextResponse.json({
        success: true,
        message: editMessage,
        property: { id: targetDocId, ...existingData, ...updatedPayload },
      });
    }

    // Create New Property Listing
    const requestedStatus = status === "DRAFT" ? "DRAFT" : "PENDING_REVIEW";
    const newPropertyRef = adminDb.collection("estate_properties").doc();
    const newProperty = {
      propertyId: newPropertyRef.id,
      sellerId: uid,
      sellerName: sellerData.agencyName || sellerData.displayName || decoded.email || "Property Agent",
      sellerPhone: sellerData.phone || "",
      sellerEmail: sellerData.email || decoded.email || "",
      sellerAvatarUrl: sellerData.avatarUrl || "",
      title: String(title).trim(),
      description: String(description).trim(),
      purpose: purpose,
      propertyType: propertyType,
      price: Number(price) || 0,
      currency: "NGN",
      pricePeriod: purpose === "Sale" ? "None" : pricePeriod || "year",
      location: {
        address: String(location.address).trim(),
        city: String(location.city || "").trim(),
        state: String(location.state || "").trim(),
      },
      bedrooms: bedrooms ? Number(bedrooms) : 0,
      bathrooms: bathrooms ? Number(bathrooms) : 0,
      toilets: toilets ? Number(toilets) : 0,
      propertySize: propertySize || "",
      furnished: furnished || "Unfurnished",
      amenities: Array.isArray(amenities) ? amenities : [],
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      status: requestedStatus,
      verificationStatus: sellerData.isVerified ? "VERIFIED" : "PENDING",
      featured: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await newPropertyRef.set(newProperty);

    return NextResponse.json({
      success: true,
      message: requestedStatus === "DRAFT" ? "Property saved as draft." : "Property listing submitted for approval.",
      property: { id: newPropertyRef.id, ...newProperty },
    });
  } catch (err: any) {
    console.error("[POST /api/estate/properties Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to create property listing." }, { status: 500 });
  }
}
