import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phoneNumber, bvnNin, email } = body;

    const queryResults: string[] = [];

    // 0. Check email if provided
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const emailQuery = await adminDb.collection("users")
        .where("email", "==", cleanEmail)
        .limit(1)
        .get();

      if (!emailQuery.empty) {
        queryResults.push("Email Address");
      }
    }

    // 1. Check phone number if provided
    if (phoneNumber) {
      const cleanPhone = phoneNumber.trim();

      // Let's check exact match
      const phoneQuery1 = await adminDb.collection("users")
        .where("phoneNumber", "==", cleanPhone)
        .limit(1)
        .get();

      if (!phoneQuery1.empty) {
        queryResults.push("Phone Number");
      } else {
        // Also check if phoneNumber starts with a prefix, or is stored without prefix
        // e.g. +23480... vs 080...
        let normPhone = cleanPhone;
        if (normPhone.startsWith("0")) {
          normPhone = "+234" + normPhone.slice(1);
        } else if (!normPhone.startsWith("+") && normPhone.length === 10) {
          normPhone = "+234" + normPhone;
        }

        const phoneQuery2 = await adminDb.collection("users")
          .where("phoneNumber", "==", normPhone)
          .limit(1)
          .get();
        if (!phoneQuery2.empty) {
          queryResults.push("Phone Number");
        }
      }
    }

    // 2. Check BVN/NIN if provided
    if (bvnNin) {
      const cleanBvnNin = bvnNin.trim();
      if (cleanBvnNin.length === 11) {
        // Check bvn field
        const bvnQuery = await adminDb.collection("users")
          .where("bvn", "==", cleanBvnNin)
          .limit(1)
          .get();

        if (!bvnQuery.empty) {
          queryResults.push("BVN");
        } else {
          // Check nin field
          const ninQuery = await adminDb.collection("users")
            .where("nin", "==", cleanBvnNin)
            .limit(1)
            .get();
          if (!ninQuery.empty) {
            queryResults.push("NIN");
          }
        }
      }
    }

    if (queryResults.length > 0) {
      const matched = queryResults.join(" and ");
      return NextResponse.json({
        exists: true,
        matched: queryResults,
        message: `An account with this ${matched} already exists. Please login to this account, or use the 'Forgot Password' or 'Forgot PIN' options to access your Wallet.`,
      });
    }

    return NextResponse.json({ exists: false });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || "Failed to check account existence." }, { status: 500 });
  }
}
