/**
 * Device name resolver utility for extracting detailed device model info
 * (e.g. Samsung SM-G998B, Apple iPhone, Tecno, Infinix, Windows PC)
 */
export function getDetailedDeviceName(): string {
  if (typeof window === "undefined" || !navigator) return "Mobile Device";

  const ua = navigator.userAgent || "";

  // 1. Android Device Detection
  if (/android/i.test(ua)) {
    // Try matching specific model string inside User-Agent (e.g., "; SM-G998B Build/" or "; Tecno CK7n Build/")
    const modelMatch = ua.match(/;\s*([A-Za-z0-9\s_\-\.]+?)\s*(?:Build|\)|\/)/i);
    if (modelMatch && modelMatch[1]) {
      const rawModel = modelMatch[1].trim();

      // Clean up common prefix clutter
      if (!/android|linux|wv|mobile|version|K|U;/i.test(rawModel) && rawModel.length > 2) {
        if (/^SM-|^SAMSUNG/i.test(rawModel)) {
          return `Samsung ${rawModel.replace(/^SAMSUNG\s*/i, "")}`;
        }
        if (/^M2|^REDMI|^POCO|^XIAOMI/i.test(rawModel)) {
          return `Redmi/Xiaomi (${rawModel})`;
        }
        if (/^CPH|^OPPO/i.test(rawModel)) {
          return `Oppo ${rawModel}`;
        }
        if (/^V2|^VIVO/i.test(rawModel)) {
          return `Vivo ${rawModel}`;
        }
        if (/^TECNO/i.test(rawModel)) {
          return `Tecno ${rawModel}`;
        }
        if (/^INFINIX/i.test(rawModel)) {
          return `Infinix ${rawModel}`;
        }
        if (/^Pixel/i.test(rawModel)) {
          return `Google ${rawModel}`;
        }
        return rawModel;
      }
    }
    return "Android Smartphone";
  }

  // 2. iOS / iPhone / iPad Detection
  if (/iPhone/i.test(ua)) {
    return "Apple iPhone";
  }
  if (/iPad/i.test(ua)) {
    return "Apple iPad";
  }

  // 3. Desktop OS Detection
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return "MacBook / Mac";
  }
  if (/Windows NT/i.test(ua)) {
    return "Windows PC";
  }
  if (/Linux/i.test(ua) && !/android/i.test(ua)) {
    return "Linux PC";
  }

  return "Mobile Device";
}
