import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFirebaseError(error: unknown): string {
  if (!error) {
    return "An error occurred during secure authentication. Please check your network and try again.";
  }

  let code = "";
  let message = "";

  if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    code = err.code || "";
    message = err.message || "";
  }

  const combined = (code + " " + message).toLowerCase();

  if (code === "auth/email-already-in-use" || combined.includes("email-already-in-use")) {
    return "This email address is already associated with an active E-Tech account.";
  }
  if (code === "auth/invalid-email" || combined.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code === "auth/weak-password" || combined.includes("weak-password")) {
    return "Your password must contain at least 6 characters for security.";
  }
  if (
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-credential" ||
    combined.includes("wrong-password") ||
    combined.includes("user-not-found") ||
    combined.includes("invalid-credential")
  ) {
    return "The email address or password entered is incorrect. Please verify your credentials.";
  }
  if (code === "auth/too-many-requests" || combined.includes("too-many-requests")) {
    return "Access temporarily restricted due to multiple failed attempts. Please try again shortly.";
  }
  if (code === "auth/network-request-failed" || combined.includes("network-request-failed")) {
    return "Network connection error. Please check your internet connection and try again.";
  }
  if (code === "auth/popup-closed-by-user" || combined.includes("popup-closed-by-user")) {
    return "Authentication popup was closed before completing.";
  }
  if (combined.includes("firebase:") || combined.includes("auth/")) {
    return "Secure authentication failed. Please check your internet connection and try again.";
  }

  return message || "An error occurred during secure authentication. Please check your network and try again.";
}

/**
 * Safely parses response JSON, detecting HTML error pages and generating informative errors.
 * This prevents throwing vague "Unexpected token '<'" exceptions.
 */
export async function safeParseJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    console.error(`[Safe JSON Parse Error] Expected JSON but received HTML from ${response.url}. Status: ${response.status}. Body prefix: ${text.slice(0, 500)}`);
    throw new Error(`Upstream server returned an HTML error page (Status: ${response.status}). Body: ${text.slice(0, 150)}...`);
  }

  try {
    return JSON.parse(text);
  } catch (err: any) {
    console.error(`[Safe JSON Parse Error] Failed to parse JSON from ${response.url}. Status: ${response.status}. Error: ${err.message}. Body prefix: ${text.slice(0, 500)}`);
    throw new Error(`Malformed JSON response from upstream (Status: ${response.status}). Body: ${text.slice(0, 150)}...`);
  }
}
