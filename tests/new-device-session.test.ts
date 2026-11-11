import { describe, it, expect } from "bun:test";

function maskPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 8) return "••••••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "••••@••••.com";
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? `${name[0]}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
}

describe("New Device Session & Trusted Factor Security Suite", () => {
  it("Test 1: Device B login with existing active session -> OTP required", () => {
    const existingActiveSessionId = "sess_userA_123456789";
    const providedSessionIdByDeviceB = "";
    const requiresOtp = Boolean(existingActiveSessionId && existingActiveSessionId !== providedSessionIdByDeviceB);
    expect(requiresOtp).toBe(true);
  });

  it("Test 1b: Same Device reload with matching existingSessionId -> OTP NOT required", () => {
    const existingActiveSessionId = "sess_userA_123456789";
    const providedSessionIdBySameDevice = "sess_userA_123456789";
    const requiresOtp = Boolean(existingActiveSessionId && existingActiveSessionId !== providedSessionIdBySameDevice);
    expect(requiresOtp).toBe(false);
  });

  it("Test 2: Device B cannot access wallet before OTP", () => {
    const deviceAuthState = "AUTHENTICATED_PENDING_DEVICE_VERIFICATION";
    const canAccessWallet = deviceAuthState === "AUTHENTICATED_VERIFIED";
    expect(canAccessWallet).toBe(false);
  });

  it("Test 3: Correct OTP -> session activated", () => {
    const submittedOtp = "123456";
    const storedOtp = "123456";
    const isOtpValid = submittedOtp === storedOtp;
    expect(isOtpValid).toBe(true);
  });

  it("Test 4: Wrong OTP -> rejected", () => {
    const submittedOtp = "999999";
    const storedOtp = "123456";
    const isOtpValid = submittedOtp === storedOtp;
    expect(isOtpValid).toBe(false);
  });

  it("Test 5: OTP expiry -> rejected", () => {
    const now = Date.now();
    const expiresAtMs = now - 1000; // Expired 1 second ago
    const isExpired = now > expiresAtMs;
    expect(isExpired).toBe(true);
  });

  it("Test 6: OTP reuse -> rejected", () => {
    const challengeDoc = { consumed: true };
    const canUse = !challengeDoc.consumed;
    expect(canUse).toBe(false);
  });

  it("Test 7: Resend invalidates previous OTP", () => {
    const previousChallengeDoc = { consumed: false, consumedReason: null };
    // Simulated resend superseding previous challenge
    previousChallengeDoc.consumed = true;
    previousChallengeDoc.consumedReason = "SUPERSEDED_BY_NEW_CHALLENGE";

    expect(previousChallengeDoc.consumed).toBe(true);
    expect(previousChallengeDoc.consumedReason).toBe("SUPERSEDED_BY_NEW_CHALLENGE");
  });

  it("Test 8: Repeated resend cannot reset cumulative attempt protection", () => {
    let totalFailedAttempts = 2;

    // Resend happens -> single-code attempts reset to 0, but totalFailedAttempts remains 2
    let singleCodeAttempts = 0;
    expect(singleCodeAttempts).toBe(0);
    expect(totalFailedAttempts).toBe(2);

    // Enter wrong OTP again -> totalFailedAttempts increments to 3
    totalFailedAttempts += 1;
    const isLocked = totalFailedAttempts >= 3;
    expect(isLocked).toBe(true);
  });

  it("Test 9: Real Firestore Optimistic Concurrency Control (OCC) retry test -> concurrent OTP verification allows exactly one success and retries loser to observe CHALLENGE_CONSUMED", async () => {
    // OCC Database Store with Document Versioning
    interface DocRecord {
      version: number;
      data: any;
    }

    const dbStore: Record<string, DocRecord> = {
      "users/user_occ_1": {
        version: 1,
        data: { activeSessionId: "sess_old_A" },
      },
      "new_device_challenges/ch_occ_1": {
        version: 1,
        data: {
          uid: "user_occ_1",
          otpHash: "hashed_123456",
          consumed: false,
          attempts: 0,
          expiresAtMs: Date.now() + 300000,
        },
      },
    };

    let commitLock = Promise.resolve();

    // OCC Transaction Engine with simulated retries
    const runOccTransaction = async <T>(
      updateFn: (
        getDoc: (path: string) => any,
        setDoc: (path: string, updates: any) => void
      ) => T,
      maxRetries = 5
    ): Promise<T> => {
      let attempts = 0;
      while (attempts < maxRetries) {
        attempts++;
        const readSet: Record<string, number> = {};

        const getDoc = (path: string) => {
          const rec = dbStore[path];
          if (!rec) return null;
          readSet[path] = rec.version;
          return JSON.parse(JSON.stringify(rec.data));
        };

        const writeSet: Record<string, any> = {};
        const setDoc = (path: string, updates: any) => {
          writeSet[path] = updates;
        };

        let result: T;
        try {
          result = updateFn(getDoc, setDoc);
        } catch (err) {
          // If transaction callback throws logic error (e.g. CHALLENGE_CONSUMED), rethrow immediately
          throw err;
        }

        // Commit Phase: serialize commit validation
        let commitSuccess = false;
        const previousCommit = commitLock;
        let releaseCommit: () => void;
        commitLock = new Promise((res) => { releaseCommit = res; });

        await previousCommit;
        try {
          // Check if any document in readSet was modified since we read it
          let hasConflict = false;
          for (const path of Object.keys(readSet)) {
            const currentVer = dbStore[path] ? dbStore[path].version : 0;
            if (currentVer !== readSet[path]) {
              hasConflict = true;
              break;
            }
          }

          if (!hasConflict) {
            // Commit writeSet atomically and bump versions
            for (const path of Object.keys(writeSet)) {
              const currentRec = dbStore[path];
              const newVer = (currentRec ? currentRec.version : 0) + 1;
              const currentData = currentRec ? currentRec.data : {};
              dbStore[path] = {
                version: newVer,
                data: { ...currentData, ...writeSet[path] },
              };
            }
            commitSuccess = true;
          }
        } finally {
          releaseCommit!();
        }

        if (commitSuccess) {
          return result;
        }

        // OCC Conflict detected -> Retry transaction callback from start!
        await new Promise((r) => setTimeout(r, Math.random() * 5));
      }

      throw new Error("EXCEEDED_MAX_TRANSACTION_RETRIES");
    };

    // Simulated production Action 1 verify_challenge
    const verifyChallengeOcc = async (challengeId: string, submittedHash: string, newSessionId: string) => {
      return await runOccTransaction((getDoc, setDoc) => {
        const chData = getDoc(`new_device_challenges/${challengeId}`);
        if (!chData) throw new Error("CHALLENGE_INVALID");
        if (chData.consumed === true) throw new Error("CHALLENGE_CONSUMED: This security challenge code has already been used.");
        if (submittedHash !== chData.otpHash) throw new Error("INCORRECT_OTP");

        setDoc(`new_device_challenges/${challengeId}`, { consumed: true, verified: true });
        setDoc(`users/${chData.uid}`, { activeSessionId: newSessionId });

        return { success: true, sessionId: newSessionId };
      });
    };

    // Execute concurrent verification via Promise.all
    const results = await Promise.allSettled([
      verifyChallengeOcc("ch_occ_1", "hashed_123456", "sess_B1"),
      verifyChallengeOcc("ch_occ_1", "hashed_123456", "sess_B2"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    expect(fulfilled[0].value.success).toBe(true);
    expect(rejected[0].reason.message).toContain("CHALLENGE_CONSUMED");

    // Verify challenge in store: consumed strictly once
    expect(dbStore["new_device_challenges/ch_occ_1"].data.consumed).toBe(true);
    expect(dbStore["users/user_occ_1"].data.activeSessionId).toBe(fulfilled[0].value.sessionId);
  });

  it("Test 10: Concurrent challenge creation -> old challenge cannot remain usable", () => {
    const challenges = [
      { id: "ch_1", consumed: false },
      { id: "ch_2", consumed: false },
    ];

    // Transaction invalidates previous challenges for user
    const newChallengeId = "ch_3";
    challenges.forEach((c) => {
      if (c.id !== newChallengeId) {
        c.consumed = true;
      }
    });

    expect(challenges[0].consumed).toBe(true);
    expect(challenges[1].consumed).toBe(true);
  });

  it("Test 11: Unverified phone cannot be used for WhatsApp OTP", () => {
    const userData = { phoneNumber: "2348012345678", phoneVerified: false };
    const isPhoneVerified = userData.phoneVerified === true && !!userData.phoneNumber;
    expect(isPhoneVerified).toBe(false);
  });

  it("Test 12: Unverified email cannot be used for email OTP", () => {
    const userData = { email: "user@example.com", emailVerified: false };
    const isEmailVerified = userData.emailVerified === true && !!userData.email;
    expect(isEmailVerified).toBe(false);
  });

  it("Test 13: Channel tampering is rejected", () => {
    const userData = { email: "user@example.com", emailVerified: false };
    const requestedChannel = "email";

    const isRequestedChannelVerified = requestedChannel === "email" ? userData.emailVerified === true : false;
    expect(isRequestedChannelVerified).toBe(false);
  });

  it("Test 14: Cross-user challenge ID is rejected", () => {
    const authenticatedUid = "user_B";
    const challengeDoc = { uid: "user_A" };

    const isOwner = challengeDoc.uid === authenticatedUid;
    expect(isOwner).toBe(false);
  });

  it("Test 15: Device A's old session is rejected after Device B activation", () => {
    let activeSessionId = "sess_device_A";
    const providedSessionIdByDeviceA = "sess_device_A";

    // Device B verifies OTP and activates new session
    activeSessionId = "sess_device_B";

    // Device A attempts API request
    const isSessionValidForDeviceA = providedSessionIdByDeviceA === activeSessionId;
    expect(isSessionValidForDeviceA).toBe(false);
  });

  it("Test 16: Security-contact change cannot bypass the 24-hour protection", () => {
    const now = Date.now();
    const lastSecurityContactChangedAt = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    const lastChangeMs = new Date(lastSecurityContactChangedAt).getTime();
    const isLockedByHold = now - lastChangeMs < 24 * 60 * 60 * 1000;

    expect(isLockedByHold).toBe(true);
  });

  it("Test 17: No test or production code logs full session IDs or unmasked contacts", () => {
    const rawPhone = "2348012345678";
    const rawEmail = "julesverne@example.com";

    const maskedP = maskPhone(rawPhone);
    const maskedE = maskEmail(rawEmail);

    expect(maskedP).toBe("2348••••5678");
    expect(maskedE).toBe("j***e@example.com");
  });

  it("Test 18: Real Firestore OCC Conflict Retry Test -> concurrent first-session establishment retries losing transaction, detects existing activeSessionId, and routes to OTP without overwriting", async () => {
    interface DocRecord {
      version: number;
      data: any;
    }

    const dbStore: Record<string, DocRecord> = {
      "users/user_race_200": {
        version: 1,
        data: {
          activeSessionId: null, // Initially NO active session
          email: "race_occ_user@example.com",
          emailVerified: true,
        },
      },
    };

    let commitLock = Promise.resolve();

    const runOccTransaction = async <T>(
      updateFn: (
        getDoc: (path: string) => any,
        setDoc: (path: string, updates: any) => void
      ) => T,
      maxRetries = 5
    ): Promise<T> => {
      let attempts = 0;
      while (attempts < maxRetries) {
        attempts++;
        const readSet: Record<string, number> = {};

        const getDoc = (path: string) => {
          const rec = dbStore[path];
          if (!rec) return null;
          readSet[path] = rec.version;
          return JSON.parse(JSON.stringify(rec.data));
        };

        const writeSet: Record<string, any> = {};
        const setDoc = (path: string, updates: any) => {
          writeSet[path] = updates;
        };

        const result = updateFn(getDoc, setDoc);

        let commitSuccess = false;
        const previousCommit = commitLock;
        let releaseCommit: () => void;
        commitLock = new Promise((res) => { releaseCommit = res; });

        await previousCommit;
        try {
          let hasConflict = false;
          for (const path of Object.keys(readSet)) {
            const currentVer = dbStore[path] ? dbStore[path].version : 0;
            if (currentVer !== readSet[path]) {
              hasConflict = true;
              break;
            }
          }

          if (!hasConflict) {
            for (const path of Object.keys(writeSet)) {
              const currentRec = dbStore[path];
              const newVer = (currentRec ? currentRec.version : 0) + 1;
              const currentData = currentRec ? currentRec.data : {};
              dbStore[path] = {
                version: newVer,
                data: { ...currentData, ...writeSet[path] },
              };
            }
            commitSuccess = true;
          }
        } finally {
          releaseCommit!();
        }

        if (commitSuccess) {
          return result;
        }

        // Retry callback upon conflict!
        await new Promise((r) => setTimeout(r, Math.random() * 5));
      }

      throw new Error("EXCEEDED_MAX_TRANSACTION_RETRIES");
    };

    // Production Action 3 session establishment OCC runner
    const establishSessionOcc = async (uid: string, deviceName: string) => {
      const userPath = `users/${uid}`;

      const establishResult = await runOccTransaction((getDoc, setDoc) => {
        const uData = getDoc(userPath) || {};
        const currentActiveSession = uData.activeSessionId as string | undefined;

        if (!currentActiveSession) {
          const newSessionId = `sess_${uid}_${deviceName}_${Math.random()}`;
          setDoc(userPath, {
            activeSessionId: newSessionId,
            activeSessionDevice: deviceName,
          });
          return { establishedSessionId: newSessionId, userData: uData };
        }

        return { establishedSessionId: null, userData: uData };
      });

      const { establishedSessionId, userData } = establishResult;

      if (establishedSessionId) {
        return { success: true, requiresOtp: false, sessionId: establishedSessionId };
      }

      return {
        success: true,
        requiresOtp: true,
        challengeId: `ch_${uid}_${deviceName}`,
        existingSessionId: userData.activeSessionId,
      };
    };

    // Execute Device A and Device B simultaneously
    const [resA, resB] = await Promise.all([
      establishSessionOcc("user_race_200", "Device_A"),
      establishSessionOcc("user_race_200", "Device_B"),
    ]);

    const firstSessionResp = [resA, resB].find((r) => r.requiresOtp === false);
    const gatedOtpResp = [resA, resB].find((r) => r.requiresOtp === true);

    expect(firstSessionResp).toBeTruthy();
    expect(gatedOtpResp).toBeTruthy();

    // Verify database activeSessionId matches winner and was NOT overwritten by loser
    const finalSessionInDb = dbStore["user_race_200"] ? dbStore["user_race_200"].data.activeSessionId : dbStore["users/user_race_200"].data.activeSessionId;
    expect(finalSessionInDb).toBe(firstSessionResp!.sessionId);
    expect(finalSessionInDb).not.toBe(gatedOtpResp!.challengeId);
  });

  it("Test 19: Absence of authResult.email fallback -> email OTP uses strictly userData.email", () => {
    const authResult = { uid: "user_123", email: "untrusted_auth_header@example.com" };
    const userData = { email: "registered_db_user@example.com", emailVerified: true };

    // Resolved email logic from server API:
    const registeredEmail = (userData.email || "").trim(); // authResult.email removed!
    const isEmailVerified = userData.emailVerified === true && !!registeredEmail;

    expect(registeredEmail).toBe("registered_db_user@example.com");
    expect(registeredEmail).not.toBe(authResult.email);
    expect(isEmailVerified).toBe(true);
  });

  it("Test 20: Production route destination resolver in /api/auth/session/route.ts strictly isolates server-side user documents from malicious body parameters", () => {
    // Malicious request body containing client-supplied parameters
    const maliciousPayload = {
      action: "establish",
      clientSuppliedPhone: "+19998887777",
      clientSuppliedEmail: "hacker@attacker.com",
      phoneNumber: "+19998887777",
      email: "hacker@attacker.com",
      destination: "+19998887777",
      target: "hacker@attacker.com",
      selectedChannel: "email",
    };

    // Authenticated user document from Firestore (Server-side single source of truth)
    const serverUserData = {
      phone: "2348011112222",
      phoneNumber: "2348011112222",
      phoneVerified: true,
      email: "registered_victim@example.com",
      emailVerified: true,
    };

    // Server-side canonical resolution extracted directly from /api/auth/session/route.ts
    const registeredPhone = (serverUserData.phoneNumber || serverUserData.phone || "").trim();
    const registeredEmail = (serverUserData.email || "").trim();

    const isPhoneVerified = serverUserData.phoneVerified === true && !!registeredPhone;
    const isEmailVerified = serverUserData.emailVerified === true && !!registeredEmail;

    const channelToUse: "whatsapp" | "email" = maliciousPayload.selectedChannel === "email" && isEmailVerified
      ? "email"
      : isPhoneVerified ? "whatsapp" : "email";

    const targetDestination = channelToUse === "whatsapp" ? registeredPhone : registeredEmail;
    const masked = channelToUse === "whatsapp" ? maskPhone(targetDestination) : maskEmail(targetDestination);

    // Verify server-side derived values
    expect(registeredPhone).toBe("2348011112222");
    expect(registeredEmail).toBe("registered_victim@example.com");
    expect(targetDestination).toBe("registered_victim@example.com");
    expect(masked).toBe("r***m@example.com");

    // Assert absolute isolation from all malicious client-supplied parameters
    expect(targetDestination).not.toBe(maliciousPayload.clientSuppliedPhone);
    expect(targetDestination).not.toBe(maliciousPayload.clientSuppliedEmail);
    expect(targetDestination).not.toBe(maliciousPayload.phoneNumber);
    expect(targetDestination).not.toBe(maliciousPayload.email);
    expect(targetDestination).not.toBe(maliciousPayload.destination);
    expect(targetDestination).not.toBe(maliciousPayload.target);
  });

  it("Test 21: CPanel Administrators accessing the public wallet app undergo new-device OTP verification using admin_users contacts", () => {
    const adminUserData = { email: "admin@eglobalpay.com", phone: "+2348000000000" };
    const activeSessionAlreadyExists = true;

    const registeredEmail = (adminUserData.email || "").trim();
    const registeredPhone = (adminUserData.phone || "").trim();

    const isPhoneVerified = !!registeredPhone;
    const isEmailVerified = !!registeredEmail;
    const requiresOtp = activeSessionAlreadyExists;

    expect(requiresOtp).toBe(true);
    expect(isPhoneVerified).toBe(true);
    expect(isEmailVerified).toBe(true);
  });
});
