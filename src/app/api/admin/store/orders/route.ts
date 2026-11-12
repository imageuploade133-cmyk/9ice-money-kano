import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.view");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "ALL";
    const searchQuery = (searchParams.get("search") || "").toLowerCase().trim();
    const limitNum = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 50));

    // Fetch order list efficiently
    let query: FirebaseFirestore.Query = adminDb.collection("store_orders");

    if (statusFilter !== "ALL") {
      query = query.where("status", "==", statusFilter);
    }

    const snapshot = await query.get();

    const orders: any[] = [];
    let grossRevenue = 0;
    let netRevenue = 0;
    let totalRealizedProfit = 0;
    let pendingCount = 0;
    let deliveredCount = 0;
    let refundedCount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const amt = Number(data.totalAmount) || 0;
      grossRevenue += amt;

      const st = String(data.status || "Pending").toLowerCase();
      const paySt = String(data.paymentStatus || "").toLowerCase();
      const isSettledOrPaid = paySt === "paid" && st !== "refunded" && st !== "canceled" && st !== "cancelled" && st !== "payment failed";

      if (st === "pending") pendingCount++;
      else if (st === "delivered") deliveredCount++;
      else if (st === "refunded" || st === "canceled" || st === "cancelled") refundedCount++;

      // Calculate Net Revenue & Realized Profit for non-refunded, paid/active orders
      if (isSettledOrPaid) {
        netRevenue += amt;

        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const sellingPrice = Number(item.price) || 0;
            const costPrice = typeof item.costPrice === "number" ? item.costPrice : 0;
            const qty = Number(item.quantity) || 1;
            const profitPerUnit = Math.max(0, sellingPrice - costPrice);
            totalRealizedProfit += profitPerUnit * qty;
          }
        }
      }

      // Apply search query filter across customer fields
      if (searchQuery) {
        const nameMatch = (data.customerName || "").toLowerCase().includes(searchQuery);
        const emailMatch = (data.customerEmail || "").toLowerCase().includes(searchQuery);
        const phoneMatch = (data.customerPhone || "").toLowerCase().includes(searchQuery);
        const idMatch = (data.id || "").toLowerCase().includes(searchQuery);
        const addressMatch = (data.deliveryAddress || "").toLowerCase().includes(searchQuery);

        if (nameMatch || emailMatch || phoneMatch || idMatch || addressMatch) {
          orders.push(data);
        }
      } else {
        orders.push(data);
      }
    });

    // Sort newest first
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = orders.length;
    const paginatedOrders = orders.slice(0, limitNum);

    return NextResponse.json({
      success: true,
      orders: paginatedOrders,
      metrics: {
        totalOrders: snapshot.size,
        grossRevenue,
        netRevenue,
        totalRevenue: netRevenue, // Canonical Net Income
        totalRealizedProfit,
        pendingCount,
        deliveredCount,
        refundedCount,
      },
      count: totalCount,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Store Orders GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch store orders", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { action, orderId, newStatus, adminNotes } = body;

    // Single order deletion with automatic wallet refund & stock restoration
    if (action === "delete_order") {
      if (!orderId) {
        return NextResponse.json({ error: "Missing orderId parameter." }, { status: 400 });
      }
      const orderRef = adminDb.collection("store_orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }

      const orderData = orderSnap.data() || {};
      const st = String(orderData.status || "").toLowerCase();
      const paySt = String(orderData.paymentStatus || "").toLowerCase();
      const isPaid = paySt === "paid" || paySt === "success";
      const isNotAlreadyRefunded = st !== "refunded" && st !== "canceled" && st !== "cancelled";

      const userId = orderData.userId;
      const refundAmount = Number(orderData.totalAmount) || 0;
      const now = new Date().toISOString();
      const storeDataRef = adminDb.collection("config").doc("store_data");

      // Execute atomic wallet refund & stock restoration if paid and not previously settled
      if (isPaid && isNotAlreadyRefunded) {
        await adminDb.runTransaction(async (transaction) => {
          const walletRef = userId ? adminDb.collection("wallets").doc(`${userId}_NGN`) : null;
          const userRef = userId ? adminDb.collection("users").doc(userId) : null;

          const storeSnap = await transaction.get(storeDataRef);
          const wSnap = walletRef ? await transaction.get(walletRef) : null;
          const userSnap = userRef ? await transaction.get(userRef) : null;

          // 1. Credit wallet balance
          if (wSnap && wSnap.exists && refundAmount > 0 && userId) {
            const currentBal = Number(wSnap.data()?.balance) || 0;
            const newBal = currentBal + refundAmount;

            transaction.update(walletRef!, {
              balance: newBal,
              updatedAt: now,
            });

            if (userSnap && userSnap.exists) {
              transaction.update(userRef!, {
                balance: newBal,
                updatedAt: now,
              });
            }

            // Write structured refund ledger entry
            const txRef = adminDb.collection("transactions").doc();
            transaction.set(txRef, {
              id: txRef.id,
              userId,
              type: "STORE_ORDER_REFUND",
              category: "REFUND",
              direction: "CREDIT",
              title: "Order Delete & Refund",
              description: `Order Delete & Refund - Order ID: ${orderId}`,
              amount: refundAmount,
              totalCredited: refundAmount,
              totalDebited: refundAmount,
              fee: 0,
              vat: 0,
              markup: 0,
              currency: "NGN",
              balanceBefore: currentBal,
              balanceAfter: newBal,
              status: "SUCCESS",
              reference: `REFUND-${orderId}`,
              orderId,
              canceledOrderId: orderId,
              recipientName: "E-Tech Store",
              items: Array.isArray(orderData.items) ? orderData.items : [],
              narration: `Order Deletion Refund for Store Order ${orderId}`,
              createdAt: now,
              updatedAt: now,
            });
          }

          // 2. Restore Inventory Stock globally
          if (storeSnap.exists && Array.isArray(orderData.items) && orderData.stockRestored !== true) {
            const currentItems: any[] = Array.isArray(storeSnap.data()?.items)
              ? [...(storeSnap.data()?.items)]
              : [];
            let stockModified = false;

            for (const oItem of orderData.items) {
              const idx = currentItems.findIndex((i: any) => i.id === oItem.id);
              if (idx > -1) {
                const targetItem = currentItems[idx];
                if (!targetItem.unlimitedStock && typeof targetItem.stockQuantity === "number") {
                  const restoredQty = targetItem.stockQuantity + (Number(oItem.quantity) || 1);
                  currentItems[idx] = {
                    ...targetItem,
                    stockQuantity: restoredQty,
                    inStock: restoredQty > 0,
                  };
                  stockModified = true;
                }
              }
            }

            if (stockModified) {
              transaction.update(storeDataRef, { items: currentItems, updatedAt: now });
            }
          }
        });

        // Dispatch wallet push notification to customer for order deletion & refund
        if (userId) {
          try {
            const { NotificationService } = await import("@/services/notification-service");
            await NotificationService.sendPushNotification(userId, {
              userId,
              title: `Store Order Refunded & Removed: ${orderId}`,
              body: `Your store order ${orderId} was removed by admin. ₦${refundAmount.toLocaleString()} NGN has been refunded to your wallet and items returned to store inventory.`,
              type: "transaction",
              url: "/store",
              amount: refundAmount,
              currency: "NGN",
              reference: `ORDER-${orderId}`,
              recipientName: "E-Tech Store",
              bankName: "Store Order",
              channel: "STORE_ORDER",
            } as any);
          } catch (notifErr: any) {
            console.warn("[Admin Store Orders Delete] Push notification warning:", notifErr?.message);
          }
        }
      }

      await orderRef.delete();
      return NextResponse.json({
        success: true,
        message: isPaid && isNotAlreadyRefunded
          ? `Order ${orderId} deleted successfully! ₦${refundAmount.toLocaleString()} NGN was refunded to customer wallet and stock returned to inventory.`
          : `Order ${orderId} deleted successfully!`,
      });
    }

    // Bulk purge abandoned, failed, or canceled orders
    if (action === "purge_failed_orders") {
      const ordersSnap = await adminDb.collection("store_orders").get();
      let purgedCount = 0;
      const batch = adminDb.batch();

      ordersSnap.forEach((doc) => {
        const data = doc.data();
        const st = String(data.status || "").toLowerCase();
        const paySt = String(data.paymentStatus || "").toLowerCase();

        if (
          st === "payment failed" ||
          st === "pending payment" ||
          st === "canceled" ||
          st === "cancelled" ||
          paySt === "failed" ||
          paySt === "pending_payment"
        ) {
          batch.delete(doc.ref);
          purgedCount++;
        }
      });

      if (purgedCount > 0) {
        await batch.commit();
      }

      return NextResponse.json({
        success: true,
        message: `Purged ${purgedCount} failed, abandoned, and canceled store order records from system storage!`,
        purgedCount,
      });
    }

    if (action !== "update_status" || !orderId || !newStatus) {
      return NextResponse.json({ error: "Missing required parameters (action, orderId, newStatus)." }, { status: 400 });
    }

    const orderRef = adminDb.collection("store_orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const orderData = orderSnap.data() || {};
    const oldStatus = orderData.status;
    const userId = orderData.userId;
    const now = new Date().toISOString();

    // Prevent modifying status if order has already been Refunded or Canceled
    const isAlreadySettled = String(oldStatus || "").toLowerCase() === "refunded" || String(oldStatus || "").toLowerCase() === "canceled" || String(oldStatus || "").toLowerCase() === "cancelled";
    if (isAlreadySettled) {
      return NextResponse.json(
        { error: "This order has already been refunded/canceled. Its status cannot be modified further; administrators may only delete the record." },
        { status: 400 }
      );
    }

    const isRefundAction = (newStatus === "Refunded" || newStatus === "Canceled") && (oldStatus !== "Refunded" && oldStatus !== "Canceled");

    if (isRefundAction) {
      const refundAmount = Number(orderData.totalAmount) || 0;
      const storeDataRef = adminDb.collection("config").doc("store_data");

      await adminDb.runTransaction(async (transaction) => {
        const walletRef = userId ? adminDb.collection("wallets").doc(`${userId}_NGN`) : null;
        const userRef = userId ? adminDb.collection("users").doc(userId) : null;

        // Perform ALL reads first
        const storeSnap = await transaction.get(storeDataRef);
        const wSnap = walletRef ? await transaction.get(walletRef) : null;
        const userSnap = userRef ? await transaction.get(userRef) : null;

        // 1. Refund Wallet Balance
        if (wSnap && wSnap.exists && refundAmount > 0 && userId) {
          const currentBal = Number(wSnap.data()?.balance) || 0;
          const newBal = currentBal + refundAmount;

          transaction.update(walletRef!, {
            balance: newBal,
            updatedAt: now,
          });

          if (userSnap && userSnap.exists) {
            transaction.update(userRef!, {
              balance: newBal,
              updatedAt: now,
            });
          }

          // Write structured refund ledger entry
          const txRef = adminDb.collection("transactions").doc();
          transaction.set(txRef, {
            id: txRef.id,
            userId,
            type: "STORE_ORDER_REFUND",
            category: "REFUND",
            direction: "CREDIT",
            title: "Order Cancel & Refund",
            description: `Order Cancel & Refund - Order ID: ${orderId}`,
            amount: refundAmount,
            totalCredited: refundAmount,
            totalDebited: refundAmount,
            totalDeducted: refundAmount,
            totalRefunded: refundAmount,
            fee: 0,
            vat: 0,
            markup: 0,
            currency: "NGN",
            balanceBefore: currentBal,
            balanceAfter: newBal,
            status: "SUCCESS",
            reference: `REFUND-${orderId}`,
            orderId: orderId,
            canceledOrderId: orderId,
            recipientName: "E-Tech Store",
            beneficiaryName: "E-Tech Store",
            items: Array.isArray(orderData.items) ? orderData.items : [],
            narration: `Order Cancel & Refund for Store Order ${orderId}`,
            createdAt: now,
            updatedAt: now,
          });
        }

        // 2. Restore Inventory Stock globally to config/store_data
        if (storeSnap.exists && Array.isArray(orderData.items) && orderData.stockRestored !== true) {
          const currentItems: any[] = Array.isArray(storeSnap.data()?.items)
            ? [...(storeSnap.data()?.items)]
            : [];
          let stockModified = false;

          for (const oItem of orderData.items) {
            const idx = currentItems.findIndex((i: any) => i.id === oItem.id);
            if (idx > -1) {
              const targetItem = currentItems[idx];
              if (!targetItem.unlimitedStock && typeof targetItem.stockQuantity === "number") {
                const restoredQty = targetItem.stockQuantity + (Number(oItem.quantity) || 1);
                currentItems[idx] = {
                  ...targetItem,
                  stockQuantity: restoredQty,
                  inStock: restoredQty > 0,
                };
                stockModified = true;
              }
            }
          }

          if (stockModified) {
            transaction.update(storeDataRef, { items: currentItems, updatedAt: now });
          }
        }
      });
    }

    // Update order status
    const updatePayload: Record<string, any> = {
      status: newStatus,
      stockRestored: isRefundAction ? true : Boolean(orderData.stockRestored),
      updatedAt: now,
    };

    if (adminNotes !== undefined) {
      updatePayload.adminNotes = String(adminNotes).trim();
    }

    await orderRef.update(updatePayload);

    // Dispatch wallet push notification to customer for order status update
    if (userId) {
      try {
        const { NotificationService } = await import("@/services/notification-service");
        const statusTitle = isRefundAction
          ? `Store Order Refunded: ${orderId}`
          : `Store Order Status: ${newStatus}`;
        const statusBody = isRefundAction
          ? `Your store order ${orderId} was updated to "${newStatus}". ₦${Number(orderData.totalAmount || 0).toLocaleString()} NGN has been refunded to your wallet and items returned to store inventory.`
          : `Your store order ${orderId} status was updated to "${newStatus}".${adminNotes ? ` Note: ${adminNotes}` : ""}`;

        await NotificationService.sendPushNotification(userId, {
          userId,
          title: statusTitle,
          body: statusBody,
          type: "transaction",
          url: "/store",
          amount: Number(orderData.totalAmount || 0),
          currency: "NGN",
          reference: `ORDER-${orderId}`,
          recipientName: "E-Tech Store",
          bankName: "Store Order",
          channel: "STORE_ORDER",
        } as any);
      } catch (notifErr: any) {
        console.warn("[Admin Store Orders] Push notification dispatch warning:", notifErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: isRefundAction
        ? `Order status updated to "${newStatus}", inventory stock restored to catalog, and ₦${Number(orderData.totalAmount || 0).toLocaleString()} refunded to customer wallet!`
        : `Order status updated to "${newStatus}"!`,
      orderId,
      status: newStatus,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Store Orders POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update order status", details: error.message }, { status: 500 });
  }
}
