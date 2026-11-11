if (typeof window !== "undefined" && !(window as any).__fetchInterceptorInitialized) {
  (window as any).__fetchInterceptorInitialized = true;
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Attach X-Session-ID header to internal API requests if available in localStorage
    if (urlStr.startsWith("/") || urlStr.includes(window.location.host)) {
      const activeSessionId = localStorage.getItem("active_session_id");
      if (activeSessionId) {
        init = init || {};
        init.headers = init.headers || {};
        if (init.headers instanceof Headers) {
          if (!init.headers.has("X-Session-ID")) {
            init.headers.set("X-Session-ID", activeSessionId);
          }
        } else if (Array.isArray(init.headers)) {
          const hasSess = init.headers.some(([k]) => k.toLowerCase() === "x-session-id");
          if (!hasSess) {
            init.headers.push(["X-Session-ID", activeSessionId]);
          }
        } else {
          const headersObj = init.headers as Record<string, string>;
          if (!headersObj["X-Session-ID"] && !headersObj["x-session-id"]) {
            headersObj["X-Session-ID"] = activeSessionId;
          }
        }
      }
    }

    const response = await originalFetch.call(this, input, init);

    // Automatically intercept 401 REVOKED_SESSION responses safely
    if (response.status === 401) {
      try {
        const clonedRes = response.clone();
        const data = await clonedRes.json();
        if (data?.error && typeof data.error === "string" && data.error.includes("REVOKED_SESSION")) {
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
          const isAuthRoute = currentPath.startsWith("/auth");
          const isAuthApi = urlStr.includes("/api/auth/");
          const hasActiveSession = typeof window !== "undefined" && Boolean(localStorage.getItem("active_session_id"));

          // Only trigger global session revocation logout if an active session WAS established
          // and we are NOT on auth pages or initiating authentication APIs
          if (hasActiveSession && !isAuthRoute && !isAuthApi) {
            console.warn("[Fetch Interceptor] 401 REVOKED_SESSION received. Triggering sign out...");
            localStorage.removeItem("active_session_id");
            if (typeof window !== "undefined") {
              const { handleAppSignOut } = await import("@/lib/logout-util");
              handleAppSignOut("Your account was signed in on another device. You have been logged out on this device.");
            }
          } else {
            console.warn("[Fetch Interceptor] Ignored 401 REVOKED_SESSION during unverified/pending state:", urlStr);
            localStorage.removeItem("active_session_id");
          }
        }
      } catch {
        // Non-JSON response, ignore
      }
    }

    return response;
  };
}
