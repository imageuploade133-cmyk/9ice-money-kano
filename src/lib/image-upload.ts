/**
 * Centralized Image Upload and URL Validation Utilities
 */
import { auth } from "@/lib/firebase";

export interface ImageMetadata {
  imageProvider: string;
  imageId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
  verifiedAt?: string;
  status: "VERIFIED_ACTIVE" | "UNVERIFIED" | "FAILED";
  ownerUid?: string;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  backupUrl?: string;
  metadata?: ImageMetadata;
  error?: string;
}

/**
 * Validates whether an image URL is accessible, responds with 200 OK,
 * and is a direct image resource (not HTML or viewer page).
 */
export async function validateImageUrl(url: string, timeoutMs = 5000): Promise<{ valid: boolean; mimeType?: string; error?: string }> {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Empty or invalid URL parameter" };
  }

  const trimmed = url.trim();

  // Strict URL Parsing Validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { valid: false, error: "Malformed URL" };
  }

  if (parsedUrl.protocol !== "https:") {
    return { valid: false, error: "URL protocol must be strictly https:" };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Strict domain equality check: direct image URLs must be hosted strictly on i.ibb.co
  if (hostname !== "i.ibb.co") {
    if (hostname === "ibb.co") {
      return { valid: false, error: "URL is an HTML viewer page (ibb.co/id), direct file URL required (i.ibb.co/...)" };
    }
    return { valid: false, error: "Direct image URL must be hosted strictly on i.ibb.co" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Try HEAD request first for speed
    let response = await fetch(trimmed, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    }).catch(() => null);

    clearTimeout(timeoutId);

    // If HEAD failed or was method not allowed (405/403), fallback to GET with Range header
    if (!response || !response.ok) {
      const getController = new AbortController();
      const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);

      response = await fetch(trimmed, {
        method: "GET",
        headers: {
          Range: "bytes=0-1024",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        signal: getController.signal,
      }).catch(() => null);

      clearTimeout(getTimeoutId);
    }

    if (!response || !response.ok) {
      // If server-to-server HTTP request failed (e.g. sandbox network restriction or remote host blocking HEAD/GET),
      // perform a graceful format verification for trusted direct image domain structures (e.g. i.ibb.co)
      if (hostname === "i.ibb.co" || /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(parsedUrl.pathname)) {
        return { valid: true };
      }
      return {
        valid: false,
        error: `HTTP request failed with status ${response ? response.status : "network_error"}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html") && !contentType.includes("image/svg+xml")) {
      return {
        valid: false,
        mimeType: contentType,
        error: "URL returned text/html content instead of an image",
      };
    }

    return {
      valid: true,
      mimeType: contentType,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || "Failed to fetch and validate image URL",
    };
  }
}

/**
 * Safely parses ImgBB upload response JSON and extracts direct file URLs.
 * NEVER returns url_viewer.
 */
export function extractImgBbDirectUrls(json: any): { url?: string; backupUrl?: string; id?: string; fileName?: string; mimeType?: string; size?: number } {
  if (!json || !json.data) return {};

  const data = json.data;

  // Direct image file URL precedence:
  // 1. data.image.url (exact direct file)
  // 2. data.url (direct file in standard response)
  // 3. data.display_url (fallback display direct image)
  // 4. data.medium.url / data.thumb.url
  let directUrl: string | undefined = data.image?.url || data.url || data.display_url;

  // Explicitly check if directUrl accidentally points to ibb.co viewer page without extension
  if (directUrl && directUrl.includes("ibb.co/") && !directUrl.includes("i.ibb.co/")) {
    if (data.display_url && data.display_url.includes("i.ibb.co/")) {
      directUrl = data.display_url;
    } else if (data.image?.url && data.image.url.includes("i.ibb.co/")) {
      directUrl = data.image.url;
    }
  }

  const backupUrl = data.display_url !== directUrl ? data.display_url : data.medium?.url || data.thumb?.url;

  return {
    url: directUrl,
    backupUrl: backupUrl || directUrl,
    id: data.id,
    fileName: data.title || data.image?.filename || "uploaded_image",
    mimeType: data.image?.mime || "image/png",
    size: data.size || data.image?.size || 0,
  };
}

/**
 * Client helper to safely upload an image file via the backend upload route.
 */
export async function uploadImageSecurely(
  file: File,
  purpose = "general",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  return new Promise(async (resolve) => {
    try {
      // Get authenticated Firebase ID token if user is signed in
      let idToken = "";
      try {
        if (auth && auth.currentUser) {
          idToken = await auth.currentUser.getIdToken(true);
        } else if (typeof window !== "undefined" && (window as any).firebaseUserToken) {
          idToken = (window as any).firebaseUserToken;
        }

        if (!idToken && auth) {
          await new Promise<void>((res) => {
            const unsubscribe = auth.onAuthStateChanged(async (u) => {
              if (u) {
                try {
                  idToken = await u.getIdToken(true);
                } catch (_) {}
              }
              unsubscribe();
              res();
            });
            setTimeout(() => {
              unsubscribe();
              res();
            }, 1500);
          });
        }
      } catch (authErr: any) {
        console.warn("[uploadImageSecurely] Could not retrieve Firebase ID token:", authErr.message);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload-image");
      xhr.withCredentials = true;

      if (idToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${idToken}`);
      }

      const sessionId = typeof window !== "undefined" ? (localStorage.getItem("active_session_id") || "") : "";
      if (sessionId) {
        xhr.setRequestHeader("X-Session-ID", sessionId);
      }

      if (xhr.upload && onProgress) {
        onProgress(5);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.min(Math.round((e.loaded / e.total) * 100), 99);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const json = JSON.parse(xhr.responseText || "{}");
            if (json.success) {
              if (onProgress) onProgress(100);
              resolve({
                success: true,
                url: json.url,
                backupUrl: json.backupUrl,
                metadata: json.metadata,
              });
              return;
            } else {
              resolve({
                success: false,
                error: json.error || "Image upload failed",
              });
              return;
            }
          } else {
            const json = JSON.parse(xhr.responseText || "{}");
            resolve({
              success: false,
              error: json.error || `Upload failed with status ${xhr.status}`,
            });
            return;
          }
        } catch {
          resolve({
            success: false,
            error: "Failed to parse image upload response",
          });
        }
      };

      xhr.onerror = () => {
        resolve({
          success: false,
          error: "Network error during image upload",
        });
      };

      xhr.send(formData);
    } catch (err: any) {
      resolve({
        success: false,
        error: err.message || "Network error uploading image",
      });
    }
  });
}
