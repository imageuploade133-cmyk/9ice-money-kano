import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { verifyAdminAuth } from "@/lib/admin-auth";

const DEFAULT_BILLERS = [
  { code: "mtn", name: "MTN Network", category: "Airtime & Data" },
  { code: "glo", name: "GLO Network", category: "Airtime & Data" },
  { code: "airtel", name: "Airtel Network", category: "Airtime & Data" },
  { code: "9mobile", name: "9mobile Network", category: "Airtime & Data" },
  { code: "kedco", name: "KEDCO Kano Electric", category: "Electricity Discos" },
  { code: "ikedc", name: "IKEDC Ikeja Electric", category: "Electricity Discos" },
  { code: "ekedc", name: "EKEDC Eko Electric", category: "Electricity Discos" },
  { code: "aedc", name: "AEDC Abuja Electric", category: "Electricity Discos" },
  { code: "phed", name: "PHED Port Harcourt Electric", category: "Electricity Discos" },
  { code: "jed", name: "JED Jos Electric", category: "Electricity Discos" },
  { code: "eedc", name: "EEDC Enugu Electric", category: "Electricity Discos" },
  { code: "ibedc", name: "IBEDC Ibadan Electric", category: "Electricity Discos" },
  { code: "kaedco", name: "KAEDCO Kaduna Electric", category: "Electricity Discos" },
  { code: "dstv", name: "DStv Subscription", category: "Cable TV" },
  { code: "gotv", name: "GOtv Subscription", category: "Cable TV" },
  { code: "startimes", name: "StarTimes Subscription", category: "Cable TV" },
  { code: "waec", name: "WAEC Result Checker", category: "Education" },
  { code: "smile", name: "Smile Internet", category: "Internet & Gaming" },
  { code: "spectranet", name: "Spectranet Internet", category: "Internet & Gaming" },
  { code: "bet9ja", name: "Bet9ja Wallet", category: "Internet & Gaming" },
  { code: "sportybet", name: "SportyBet Wallet", category: "Internet & Gaming" },
  { code: "nairabet", name: "Nairabet Wallet", category: "Internet & Gaming" },
  { code: "swap", name: "Currency Swap Service", category: "Currency Swaps" },
  { code: "store", name: "E-Tech Store Purchase", category: "Store Orders" },
  { code: "investment", name: "Fixed Deposit Investment", category: "Investments" },
  { code: "deposit", name: "Deposit Funding Service", category: "Wallet Deposits" },
];

export async function GET(req: Request) {
  try {
    let storedLogos: Record<string, string> = {};
    try {
      await verifyAdminAuth(req);
      const docSnap = await adminDb.collection("config").doc("bill_logos").get();
      storedLogos = docSnap.exists ? docSnap.data() || {} : {};
    } catch (authErr: any) {
      console.warn("[Admin Bill Logos GET Auth Warning]:", authErr.message);
    }

    return NextResponse.json({
      success: true,
      defaultBillers: DEFAULT_BILLERS,
      logos: storedLogos,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Bill Logos GET Error]:", error.message);
    return NextResponse.json({
      success: true,
      defaultBillers: DEFAULT_BILLERS,
      logos: {},
    });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "bill_logos.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { billerCode, logoUrl, logos } = body;

    const docRef = adminDb.collection("config").doc("bill_logos");

    if (logos && typeof logos === "object") {
      // Bulk save
      await docRef.set(logos, { merge: true });
      return NextResponse.json({
        success: true,
        message: "Bill logos updated successfully!",
      });
    }

    if (!billerCode) {
      return NextResponse.json({ error: "Missing required parameter: billerCode" }, { status: 400 });
    }

    const cleanCode = billerCode.trim().toLowerCase();
    const cleanUrl = typeof logoUrl === "string" ? logoUrl.trim() : "";

    await docRef.set(
      {
        [cleanCode]: cleanUrl,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: `Logo for ${cleanCode.toUpperCase()} updated successfully!`,
      billerCode: cleanCode,
      logoUrl: cleanUrl,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Bill Logos POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update bill logo", details: error.message }, { status: 500 });
  }
}
