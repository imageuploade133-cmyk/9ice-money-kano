import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { extractImgBbDirectUrls, validateImageUrl, ImageMetadata } from "@/lib/image-upload";

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Allowed upload purposes
const ALLOWED_PURPOSES = new Set([
  "profile_avatar",
  "kyc_selfie",
  "kyc_document",
  "store_product",
  "store_category",
  "estate_property",
  "estate_listing",
  "estate_logo",
  "estate_banner",
  "admin_asset",
  "general",
  "banner",
  "app_logo",
  "receipt_logo",
  "statement_logo",
  "statement_signature",
  "statement_stamp",
  "statement_watermark",
  "bank_logo",
  "bill_logo",
  "report_evidence",
  "agent_avatar",
  "editor_inline_image",
  "broadcast_image",
  "broadcast_doc",
]);

/**
 * Validates file magic bytes (header bytes) and matches against allowed extension/MIME pairs.
 */
function validateImageFileFormat(buffer: Buffer, fileName: string, declaredMime: string): { valid: boolean; detectedMime?: string; error?: string } {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: "File data is too small or invalid" };
  }

  const ext = (fileName.split(".").pop() || "").toLowerCase();

  let detectedMime: string | undefined;

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedMime = "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    detectedMime = "image/png";
  }
  // GIF: 47 49 46 38 ('GIF8')
  else if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    detectedMime = "image/gif";
  }
  // WEBP: RIFF ... WEBP (52 49 46 46 ... 57 45 42 50)
  else if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    detectedMime = "image/webp";
  } else {
    return { valid: false, error: "Corrupted or unsupported image file header signature" };
  }

  // Validate strict extension & MIME combinations:
  // .jpg / .jpeg -> image/jpeg
  // .png -> image/png
  // .webp -> image/webp
  // .gif -> image/gif
  if (detectedMime === "image/jpeg") {
    if (ext !== "jpg" && ext !== "jpeg") {
      return { valid: false, error: `Extension .${ext} does not match JPEG image signature` };
    }
  } else if (detectedMime === "image/png") {
    if (ext !== "png") {
      return { valid: false, error: `Extension .${ext} does not match PNG image signature` };
    }
  } else if (detectedMime === "image/webp") {
    if (ext !== "webp") {
      return { valid: false, error: `Extension .${ext} does not match WEBP image signature` };
    }
  } else if (detectedMime === "image/gif") {
    if (ext !== "gif") {
      return { valid: false, error: `Extension .${ext} does not match GIF image signature` };
    }
  }

  return { valid: true, detectedMime };
}

export async function POST(req: Request) {
  try {
    // REQUIREMENT: Reject JSON or base64/data image submissions completely. Accept multipart File uploads only.
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Unsupported Media Type: /api/upload-image accepts multipart/form-data File uploads only. JSON and base64 payloads are strictly rejected." },
        { status: 415 }
      );
    }

    // STEP 1: Require Authentication via Firebase ID Token or CPanel Admin Session Cookie
    let authUser: { uid: string; email?: string } | null = null;
    try {
      authUser = await authenticateUserRequest(req);
    } catch (authErr: any) {
      // Fall back to verifyAdminAuth for CPanel Admin session cookie authentication
      try {
        const adminAuth = await verifyAdminAuth(req);
        if (adminAuth && adminAuth.isAdmin) {
          authUser = { uid: adminAuth.uid, email: adminAuth.email };
        }
      } catch (adminErr: any) {
        // Both standard user auth and admin cookie auth failed
      }
    }

    if (!authUser || !authUser.uid) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required to upload images." },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null || formData.get("image") as File | null;
    const purpose = ((formData.get("purpose") as string) || "general").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No image file provided. Request must include a multipart file binary." },
        { status: 400 }
      );
    }

    // STEP 2: Purpose Validation
    if (!ALLOWED_PURPOSES.has(purpose)) {
      return NextResponse.json(
        { error: `Invalid upload purpose '${purpose}'.` },
        { status: 400 }
      );
    }

    // Resolve dynamic max upload size limit from CPanel config/app or environment
    let maxUploadSizeMb = 10;

    try {
      const appConfigSnap = await adminDb.collection("config").doc("app").get();
      if (appConfigSnap.exists) {
        const appConfigData = appConfigSnap.data();
        if (appConfigData?.maxKycUploadSizeMb && typeof appConfigData.maxKycUploadSizeMb === "number") {
          maxUploadSizeMb = appConfigData.maxKycUploadSizeMb;
        }
      }
    } catch (configErr: any) {
      console.warn("[Upload API] Failed to fetch CPanel config app settings:", configErr.message);
    }

    const maxSizeBytes = maxUploadSizeMb * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        { error: `File size exceeds the configured CPanel upload limit of ${maxUploadSizeMb}MB (uploaded file is ${(file.size / (1024 * 1024)).toFixed(2)}MB)` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    if (imageBuffer.length === 0) {
      return NextResponse.json({ error: "Empty image file" }, { status: 400 });
    }

    // STEP 3: Strict Extension, MIME & Magic Byte Validation
    const formatResult = validateImageFileFormat(imageBuffer, file.name || "uploaded.png", file.type || "image/png");
    if (!formatResult.valid) {
      return NextResponse.json(
        { error: `Invalid image file format: ${formatResult.error}` },
        { status: 400 }
      );
    }

    const verifiedMimeType = formatResult.detectedMime || file.type;
    if (!ALLOWED_MIME_TYPES.has(verifiedMimeType)) {
      return NextResponse.json(
        { error: `Unsupported image MIME type: ${verifiedMimeType}` },
        { status: 400 }
      );
    }

    // REQUIREMENT 3: Resolve ImgBB API key. Check CPanel config/app_secrets first, then config/app, then process.env.IMGBB_API_KEY
    let apiKey: string | undefined;

    try {
      const secretsSnap = await adminDb.collection("config").doc("app_secrets").get();
      if (secretsSnap.exists) {
        const secretsData = secretsSnap.data();
        if (secretsData?.imgbbApiKey && typeof secretsData.imgbbApiKey === "string" && secretsData.imgbbApiKey.trim()) {
          apiKey = secretsData.imgbbApiKey.trim();
        }
      }

      if (!apiKey) {
        const appConfigSnap = await adminDb.collection("config").doc("app").get();
        if (appConfigSnap.exists) {
          const appConfigData = appConfigSnap.data();
          if (appConfigData?.imgbbApiKey && typeof appConfigData.imgbbApiKey === "string" && appConfigData.imgbbApiKey.trim()) {
            apiKey = appConfigData.imgbbApiKey.trim();
          }
        }
      }
    } catch (configErr: any) {
      console.warn("[Upload API] Failed to fetch custom imgbbApiKey from config secrets:", configErr.message);
    }

    if (!apiKey) {
      apiKey = process.env.IMGBB_API_KEY;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "Image Storage API Key is not configured in CPanel settings or server environment." },
        { status: 500 }
      );
    }

    const finalBase64 = imageBuffer.toString("base64");
    const uploadFormData = new FormData();
    uploadFormData.append("image", finalBase64);

    // CRITICAL REQUIREMENT: ImgBB remains the storage provider.
    // Notice NO 'expiration' parameter is appended to guarantee permanent retention
    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: uploadFormData,
    });

    const imgbbJson = await imgbbRes.json();

    if (!imgbbRes.ok || !imgbbJson.success) {
      const errMsg = imgbbJson.error?.message || "Image upload service error";
      console.error("[Upload API] Image upload failed:", errMsg);
      return NextResponse.json({ error: `Upload failed: ${errMsg}` }, { status: 502 });
    }

    // Safely extract direct image file URL (never url_viewer)
    const { url, backupUrl, id, fileName: extractedName, mimeType: extractedMime, size: extractedSize } = extractImgBbDirectUrls(imgbbJson);

    if (!url) {
      return NextResponse.json({ error: "Image upload succeeded but failed to extract direct image URL" }, { status: 502 });
    }

    // STRICT DIRECT URL CHECK: Use URL parser to verify hostname is strictly i.ibb.co or ibb.co and protocol is https
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:" || (parsedUrl.hostname !== "i.ibb.co" && parsedUrl.hostname !== "ibb.co")) {
        return NextResponse.json({ error: "Extracted image URL is not a direct ImgBB i.ibb.co image URL." }, { status: 502 });
      }
    } catch {
      return NextResponse.json({ error: "Extracted image URL is malformed." }, { status: 502 });
    }

    // Perform verification on the generated direct image URL before confirming success
    const validation = await validateImageUrl(url);
    if (!validation.valid) {
      console.warn(`[Upload API] Uploaded URL validation failed for ${url}:`, validation.error);
      return NextResponse.json({
        error: `Uploaded image URL verification failed: ${validation.error}`,
      }, { status: 422 });
    }

    const metadata: ImageMetadata = {
      imageProvider: "ImgBB",
      imageId: id,
      fileName: extractedName || file.name,
      mimeType: verifiedMimeType || validation.mimeType || extractedMime,
      fileSize: extractedSize || imageBuffer.length,
      uploadedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      status: "VERIFIED_ACTIVE",
      ownerUid: authUser.uid,
    };

    // REQUIREMENT 1: For kyc_selfie or kyc_document, server-verifiable upload receipt creation MUST succeed before returning success.
    if (purpose === "kyc_selfie" || purpose === "kyc_document") {
      try {
        const nowMs = Date.now();
        const receiptDocId = crypto.createHash("sha256").update(`${authUser.uid}:${url}`).digest("hex");
        await adminDb.collection("kyc_upload_receipts").doc(receiptDocId).set({
          ownerUid: authUser.uid,
          url,
          imageId: id || null,
          purpose,
          createdAt: new Date(nowMs).toISOString(),
          expiresAt: new Date(nowMs + 60 * 60 * 1000).toISOString(), // 60-minute validity window
        });
      } catch (receiptErr: any) {
        console.error("[Upload API] Mandatory KYC upload receipt creation failed:", receiptErr.message);
        return NextResponse.json({
          error: "Failed to generate server upload receipt for KYC image. Upload aborted for compliance security."
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      url,
      backupUrl: backupUrl || url,
      metadata,
      purpose,
    });
  } catch (err: any) {
    console.error("[Upload API] Exception:", err);
    return NextResponse.json({ error: err.message || "Failed to process image upload" }, { status: 500 });
  }
}
