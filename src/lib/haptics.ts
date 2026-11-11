/**
 * Triggers the wallet's native-style haptic feedback.
 *
 * In the Flutter WebView we prefer the native InAppWebView bridge because
 * navigator.vibrate() is not consistently exposed/strong enough on Android.
 * The browser API remains a safe fallback for normal web/PWA use.
 */
export const triggerHaptic = (duration = 60): void => {
  try {
    if (typeof window !== "undefined") {
      const flutterWebView = (window as any).flutter_inappwebview;
      if (flutterWebView && typeof flutterWebView.callHandler === "function") {
        void flutterWebView.callHandler("triggerHaptic", duration);
        return;
      }
    }

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(duration);
    }
  } catch {
    // Haptic feedback is optional and must never affect existing behavior.
  }
};
