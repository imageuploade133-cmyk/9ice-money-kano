import { safeParseJson } from "@/lib/utils";
import { resolveUssdCode } from "@/lib/ussd-resolver";
import { getGatewayUrl } from "@/lib/gateway-util";

const getFlwBaseUrl = () => `${getGatewayUrl()}/api/flutterwave`;

export interface USSDPaymentPayload { tx_ref: string; amount: number; email: string; phone_number: string; fullname: string; bank_code: string; bank_name?: string; }
export interface BankTransferPayload { tx_ref: string; amount: number; email: string; phone_number: string; fullname: string; firstname?: string; lastname?: string; narration?: string; }

export class PaymentService {
  static async createUSSDPayment(payload: USSDPaymentPayload, idToken: string, sessionId: string) {
    const response = await fetch(`${getFlwBaseUrl()}/charges?type=ussd`, { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json", ...(sessionId ? { "X-Session-ID": sessionId } : {}) }, body: JSON.stringify({ tx_ref: payload.tx_ref, amount: payload.amount.toString(), currency: "NGN", email: payload.email, phone_number: payload.phone_number, fullname: payload.fullname, type: "ussd", country: "NG", account_bank: payload.bank_code }) });
    const resData = await safeParseJson(response);
    console.log(`[VM Payment Gateway USSD Charge API] HTTP Status: ${response.status}`);
    console.log(`[VM Payment Gateway USSD Charge API] Raw Response: ${JSON.stringify(resData)}`);
    if (!response.ok || resData.status !== "success") throw new Error(resData.message || `HTTP Error ${response.status}`);
    const flwData = resData.data || resData || {};
    const auth = resData.meta?.authorization || resData.data?.meta?.authorization || resData.data?.authorization || {};
    const rawNote = auth.note || auth.validate_instructions || auth.instruction || flwData.payment_code || flwData.payment_instruction || resData.payment_code || resData.payment_instruction;
    const authNote = resolveUssdCode(payload.bank_code, payload.bank_name || flwData.account_bank, payload.amount, rawNote);
    return { status: "pending", flwId: flwData.id || "flw-test-id", txRef: payload.tx_ref, ussdCode: authNote, bankName: flwData.account_bank || payload.bank_name || "Selected Bank" };
  }

  static async createBankTransferPayment(payload: BankTransferPayload, idToken: string, sessionId: string) {
    const nameParts = (payload.fullname || "").trim().split(/\s+/);
    const calculatedFirstname = payload.firstname || nameParts[0] || "Customer";
    const calculatedLastname = payload.lastname || nameParts.slice(1).join(" ") || "Wallet";
    const normalizedSessionId = (sessionId || "").trim();
    if (!normalizedSessionId) {
      throw new Error("Missing session ID. Please refresh your session and try again.");
    }

    const response = await fetch(`${getFlwBaseUrl()}/charges?type=bank_transfer`, { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json", "X-Session-ID": normalizedSessionId }, body: JSON.stringify({ tx_ref: payload.tx_ref, amount: payload.amount.toString(), currency: "NGN", email: payload.email, phone_number: payload.phone_number, fullname: payload.fullname, firstname: calculatedFirstname, lastname: calculatedLastname, narration: payload.narration || "E-Tech Wallet Funding", type: "bank_transfer", is_permanent: false }) });
    const resData = await safeParseJson(response);
    console.log(`[VM Payment Gateway Bank Transfer Charge API] HTTP Status: ${response.status}`);
    console.log(`[VM Payment Gateway Bank Transfer Charge API] Raw Response: ${JSON.stringify(resData)}`);
    if (!response.ok || resData.status !== "success") throw new Error(resData.message || `HTTP Error ${response.status}`);
    const flwData = resData.data || resData || {};
    const auth = resData.meta?.authorization || resData.data?.meta?.authorization || resData.data?.authorization || {};
    const transferAccount = auth.transfer_account || flwData.transfer_account || resData.transfer_account;
    const transferBank = auth.transfer_bank || flwData.transfer_bank || resData.transfer_bank || "";
    const transferAmount = Number(auth.transfer_amount || flwData.transfer_amount || resData.transfer_amount || payload.amount);
    const transferReference = auth.transfer_reference || flwData.transfer_reference || resData.transfer_reference || payload.tx_ref;
    const transferNote = auth.transfer_note || flwData.transfer_note || resData.transfer_note || "Make direct transfer to this account number";
    if (!transferAccount) throw new Error("No dynamic virtual account was allocated by the payment gateway.");
    return { status: "pending", flwId: flwData.id || "flw-test-id", txRef: payload.tx_ref, accountNumber: transferAccount, bankName: transferBank, accountName: "E-Tech Global Hub", amount: transferAmount, expiresAt: new Date(Date.now() + 11 * 60 * 1000).toISOString(), reference: transferReference, transferAccount, transferBank, transferAmount, transferReference, transferNote };
  }

  static async checkPaymentStatus(txRef: string, idToken: string, sessionId: string) {
    const response = await fetch("/api/flutterwave/verify", { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ txRef }) });
    const resData = await safeParseJson(response);
    if (!response.ok) {
      const errorMsg = resData.message || "";
      const isNotFound = response.status === 404 || response.status === 400 || errorMsg.toLowerCase().includes("no transaction") || errorMsg.toLowerCase().includes("not found");
      if (isNotFound) return { status: "PENDING" };
      throw new Error(resData.message || "Failed to contact VM verification api.");
    }

    const flwStatusRaw = (resData.status || (resData.success ? "SUCCESSFUL" : "PENDING")).toString().toUpperCase();
    const isSuccess = flwStatusRaw === "SUCCESS" || flwStatusRaw === "SUCCESSFUL" || resData.success === true;
    const isFailed = flwStatusRaw === "FAILED" || (resData.error && resData.error.toLowerCase().includes("failed"));
    const isExpired = flwStatusRaw === "EXPIRED" || (resData.error && resData.error.toLowerCase().includes("expired"));
    const isCanceled = flwStatusRaw === "CANCELED" || flwStatusRaw === "CANCELLED" || (resData.error && resData.error.toLowerCase().includes("cancel"));

    const confirmedAmount = Number(resData.totalCredited ?? resData.fundedAmount ?? resData.amount ?? 0);

    if (isSuccess) {
      return {
        success: true,
        status: "SUCCESS",
        fundedAmount: confirmedAmount,
        totalCredited: confirmedAmount,
        amount: confirmedAmount,
        credited: resData.credited ?? true,
        newBalance: resData.newBalance,
        duplicate: resData.duplicate,
        message: resData.message,
      };
    } else if (isFailed) {
      return {
        success: false,
        status: "FAILED",
        fundedAmount: 0,
        totalCredited: 0,
        amount: 0,
        credited: false,
      };
    } else if (isExpired) {
      return {
        success: false,
        status: "EXPIRED",
        fundedAmount: 0,
        totalCredited: 0,
        amount: 0,
        credited: false,
      };
    } else if (isCanceled) {
      return {
        success: false,
        status: "CANCELED",
        fundedAmount: 0,
        totalCredited: 0,
        amount: 0,
        credited: false,
      };
    }

    return {
      success: true,
      status: "PENDING",
      fundedAmount: 0,
      totalCredited: 0,
      credited: false,
    };
  }
}
