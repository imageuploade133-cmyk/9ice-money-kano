import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";
import { checkServerFeatureStatus } from "@/lib/feature-toggle-server";
import bcrypt from "bcryptjs";
import { getGatewayUrl } from "@/lib/gateway-util";

// Helper function to auto-clean stale unpaid/abandoned orders older than 24 hours & restore stock if needed
async function autoCleanStaleAbandonedOrders() {
  try {
    const twentyFourHoursAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const staleOrdersSnap = await adminDb
      .collection("store_orders")
      .where("createdAt", "<", twentyFourHoursAgoIso)
      .get();

    if (!staleOrdersSnap.empty) {
      const ordersToPurge: any[] = [];
      staleOrdersSnap.forEach((doc) => {
        const data = doc.data();
        const st = String(data.status || "").toLowerCase();
        const paySt = String(data.paymentStatus || "").toLowerCase();

        if (
          st === "pending payment" ||
          st === "payment failed" ||
          st === "canceled" ||
          st === "cancelled" ||
          paySt === "pending_payment" ||
          paySt === "failed"
        ) {
          ordersToPurge.push({ id: doc.id, ref: doc.ref, data });
        }
      });

      if (ordersToPurge.length > 0) {
        const storeDataRef = adminDb.collection("config").doc("store_data");

        await adminDb.runTransaction(async (transaction) => {
          const storeSnap = await transaction.get(storeDataRef);
          const currentItems: any[] = Array.isArray(storeSnap.data()?.items)
            ? [...(storeSnap.data()?.items)]
            : [];
          let stockModified = false;

          for (const orderObj of ordersToPurge) {
            const data = orderObj.data;
            // If stock was deducted and not yet restored, restore item stock
            if (data.stockDeducted === true && data.stockRestored !== true && Array.isArray(data.items)) {
              for (const oItem of data.items) {
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
            }
            transaction.delete(orderObj.ref);
          }

          if (stockModified) {
            transaction.update(storeDataRef, { items: currentItems, updatedAt: new Date().toISOString() });
          }
        });

        console.log(`[Store Orders Auto-Clean] Auto-cleaned ${ordersToPurge.length} stale abandoned store orders & restored inventory stock.`);
      }
    }
  } catch (err: any) {
    console.warn("[Store Orders Auto-Clean Warning]:", err.message);
  }
}

export async function POST(req: Request) {
  try {
    const featureStatus = await checkServerFeatureStatus("store");
    if (!featureStatus.enabled) {
      return NextResponse.json({ error: featureStatus.message }, { status: 403 });
    }

    let uid = "";
    let userEmail = "";
    try {
      const authUser = await authenticateUserRequest(req);
      uid = authUser.uid;
      userEmail = authUser.email || "";
    } catch {
      return NextResponse.json({ error: "Unauthorized: Please sign in to place an order." }, { status: 401 });
    }

    // Trigger non-blocking 24h stale order cleanup routine
    autoCleanStaleAbandonedOrders().catch(() => {});

    const body = await req.json();
    const { items, customerName, customerEmail, customerPhone, deliveryAddress, paymentMethod = "WALLET_NGN", pin, isBiometricAuthenticated } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order items list cannot be empty." }, { status: 400 });
    }

    if (!customerName || !customerPhone || !deliveryAddress) {
      return NextResponse.json({ error: "Missing required customer delivery information (name, phone, address)." }, { status: 400 });
    }

    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const now = new Date().toISOString();
    const isCardCheckout = paymentMethod === "CARD_CHECKOUT";

    const paymentChannel = isCardCheckout ? "Checkout with Card Payment" : "Main NGN Wallet";
    const initialPaymentStatus = isCardCheckout ? "PENDING_PAYMENT" : "PAID";
    const initialOrderStatus = isCardCheckout ? "Pending Payment" : "Pending";
    const paymentVerificationRef = isCardCheckout
      ? `CARD-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      : `WLT-PAY-${orderId}`;

    const isPickup = String(deliveryAddress || "").toUpperCase().includes("PICKUP") || body.deliveryType === "PICKUP";
    const resolvedDeliveryType = isPickup ? "PICKUP" : "DELIVERY";

    const storeDataRef = adminDb.collection("config").doc("store_data");
    const walletRef = adminDb.collection("wallets").doc(`${uid}_NGN`);
    const userRef = adminDb.collection("users").doc(uid);
    const orderRef = adminDb.collection("store_orders").doc(orderId);

    // Prepare variables for order construction
    let finalOrderItems: any[] = [];
    let calculatedTotalAmount = 0;

    if (isCardCheckout) {
      // 100% ATOMIC TRANSACTION FOR CARD CHECKOUT: Validate prices & reserve stock atomically
      await adminDb.runTransaction(async (transaction) => {
        const storeSnap = await transaction.get(storeDataRef);
        if (!storeSnap.exists) {
          throw new Error("Store catalog database is unavailable.");
        }

        const freshStoreItems: any[] = Array.isArray(storeSnap.data()?.items)
          ? [...(storeSnap.data()?.items)]
          : [];

        calculatedTotalAmount = 0;
        finalOrderItems = [];
        let stockModified = false;

        for (const reqItem of items) {
          const idx = freshStoreItems.findIndex((i: any) => i.id === reqItem.id);
          if (idx === -1) {
            throw new Error(`Invalid item "${reqItem.title || reqItem.id}": Item does not exist in store catalog.`);
          }

          const targetStoreItem = freshStoreItems[idx];

          if (targetStoreItem.isHidden === true) {
            throw new Error(`Sorry, "${targetStoreItem.title}" is no longer available.`);
          }

          if (targetStoreItem.inStock === false) {
            throw new Error(`Sorry, "${targetStoreItem.title}" is currently out of stock.`);
          }

          const quantity = Math.max(1, Number(reqItem.quantity) || 1);

          if (!targetStoreItem.unlimitedStock && typeof targetStoreItem.stockQuantity === "number") {
            if (targetStoreItem.stockQuantity <= 0) {
              throw new Error(`Sorry, "${targetStoreItem.title}" is currently out of stock.`);
            }
            if (quantity > targetStoreItem.stockQuantity) {
              throw new Error(`Insufficient stock for "${targetStoreItem.title}". Only ${targetStoreItem.stockQuantity} unit(s) available.`);
            }

            // Deduct stock quantity atomically inside transaction
            const newQty = targetStoreItem.stockQuantity - quantity;
            freshStoreItems[idx] = {
              ...targetStoreItem,
              stockQuantity: newQty,
              inStock: newQty > 0,
            };
            stockModified = true;
          }

          // Calculate server-authoritative effective price
          const basePrice = Number(targetStoreItem.price) || 0;
          const promoPrice = typeof targetStoreItem.discountPrice === "number" && targetStoreItem.discountPrice > 0
            ? targetStoreItem.discountPrice
            : typeof targetStoreItem.promoPrice === "number" && targetStoreItem.promoPrice > 0
            ? targetStoreItem.promoPrice
            : null;

          const serverEffectivePrice = promoPrice !== null && promoPrice < basePrice ? promoPrice : basePrice;

          if (serverEffectivePrice <= 0) {
            throw new Error(`Invalid server price for "${targetStoreItem.title}".`);
          }

          calculatedTotalAmount += serverEffectivePrice * quantity;

          finalOrderItems.push({
            id: targetStoreItem.id,
            title: String(targetStoreItem.title).trim(),
            price: serverEffectivePrice,
            costPrice: typeof targetStoreItem.costPrice === "number" ? targetStoreItem.costPrice : null,
            originalListPrice: basePrice,
            quantity,
            imageUrl: String(targetStoreItem.coverImageUrl || targetStoreItem.imageUrl || "").trim(),
            category: String(targetStoreItem.category || "General").trim(),
          });
        }

        if (calculatedTotalAmount <= 0) {
          throw new Error("Invalid total order amount.");
        }

        // Write updated inventory stock back to store_data inside transaction
        if (stockModified) {
          transaction.update(storeDataRef, { items: freshStoreItems, updatedAt: now });
        }
      });

      // Generate card payment checkout link
      const gatewayUrl = getGatewayUrl();
      const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

      const txRef = `TX-STORE-${orderId}`;
      const requestHost = req.headers.get("host") || "";
      const protocol = req.headers.get("x-forwarded-proto") || (requestHost.includes("localhost") ? "http" : "https");
      const defaultOrigin = requestHost ? `${protocol}://${requestHost}` : "https://e-global-197077.vercel.app";
      const originUrl = req.headers.get("origin") || req.headers.get("referer") || defaultOrigin;
      const redirectUrl = `${originUrl.replace(/\/$/, "")}/api/store/orders/verify?orderId=${orderId}&tx_ref=${txRef}`;

      let paymentUrl = "";
      let flwErrorMessage = "";

      // Request VM proxy S2S payment initialization
      try {
        const proxyHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          proxyHeaders["X-API-Key"] = gatewayApiKey;
          proxyHeaders["Authorization"] = `Bearer ${gatewayApiKey}`;
        }

        const vmProxyRes = await fetch(`${gatewayUrl}/api/flutterwave/proxy`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({
            method: "POST",
            endpoint: "/payments",
            body: {
              tx_ref: txRef,
              amount: calculatedTotalAmount,
              currency: "NGN",
              redirect_url: redirectUrl,
              meta: { orderId, userId: uid, customerPhone },
              customer: {
                email: customerEmail || userEmail || "customer@e-tech-store.com",
                phonenumber: customerPhone,
                name: customerName,
              },
              customizations: {
                title: "E-Tech Store Order Payment",
                description: `Payment for Order ${orderId}`,
                logo: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
              },
            },
          }),
        });

        const vmProxyData = await vmProxyRes.json().catch(() => ({}));
        if (vmProxyRes.ok && vmProxyData.status === "success" && vmProxyData.data?.link) {
          paymentUrl = vmProxyData.data.link;
        } else if (vmProxyRes.ok && vmProxyData.link) {
          paymentUrl = vmProxyData.link;
        } else if (vmProxyData.message) {
          flwErrorMessage = vmProxyData.message;
        }
      } catch (err: any) {
        console.warn("[Store Order POST] VM proxy call exception:", err.message);
      }

      // Secondary: VM initialize fallback
      if (!paymentUrl) {
        try {
          const initHeaders: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (gatewayApiKey) {
            initHeaders["X-API-Key"] = gatewayApiKey;
            initHeaders["Authorization"] = `Bearer ${gatewayApiKey}`;
          }

          const vmInitRes = await fetch(`${gatewayUrl}/api/flutterwave/initialize`, {
            method: "POST",
            headers: initHeaders,
            body: JSON.stringify({
              amount: calculatedTotalAmount,
              currency: "NGN",
              email: customerEmail || userEmail || "customer@e-tech-store.com",
              name: customerName,
              userId: uid,
              redirectUrl,
              phone: customerPhone,
            }),
          });

          const vmInitData = await vmInitRes.json().catch(() => ({}));
          if (vmInitRes.ok && vmInitData.data?.link) {
            paymentUrl = vmInitData.data.link;
          } else if (vmInitRes.ok && vmInitData.link) {
            paymentUrl = vmInitData.link;
          } else if (!flwErrorMessage && vmInitData.message) {
            flwErrorMessage = vmInitData.message;
          }
        } catch (err: any) {
          console.warn("[Store Order POST] VM initialize exception:", err.message);
        }
      }

      if (!paymentUrl) {
        return NextResponse.json({
          error: flwErrorMessage || "Unable to generate card payment checkout link. Please try again or pay with Main Wallet.",
        }, { status: 502 });
      }

      const newOrder = {
        id: orderId,
        userId: uid,
        customerName: String(customerName).trim(),
        customerEmail: String(customerEmail || userEmail).trim(),
        customerPhone: String(customerPhone).trim(),
        deliveryAddress: String(deliveryAddress).trim(),
        deliveryType: resolvedDeliveryType,
        items: finalOrderItems,
        totalAmount: calculatedTotalAmount,
        currency: "NGN",
        status: initialOrderStatus,
        adminNotes: "",
        paymentMethod: "CARD_CHECKOUT",
        paymentChannel,
        paymentStatus: initialPaymentStatus,
        paymentVerificationRef,
        stockDeducted: true,
        stockRestored: false,
        txRef,
        paymentUrl,
        createdAt: now,
        updatedAt: now,
      };

      await orderRef.set(newOrder);

      return NextResponse.json({
        success: true,
        message: "Card checkout link generated! Redirecting to Flutterwave...",
        order: newOrder,
        paymentUrl,
        paymentLink: paymentUrl,
        requiresPaymentRedirect: true,
      });

    } else {
      // 100% ATOMIC TRANSACTION FOR MAIN NGN WALLET PAYMENT:
      // Verify stock, verify wallet balance, deduct stock & debit wallet in a single atomic transaction
      let newBalance = 0;

      await adminDb.runTransaction(async (transaction) => {
        // 1. Read Store Catalog & Items
        const storeSnap = await transaction.get(storeDataRef);
        if (!storeSnap.exists) {
          throw new Error("Store catalog database is unavailable.");
        }

        const freshStoreItems: any[] = Array.isArray(storeSnap.data()?.items)
          ? [...(storeSnap.data()?.items)]
          : [];

        calculatedTotalAmount = 0;
        finalOrderItems = [];
        let stockModified = false;

        for (const reqItem of items) {
          const idx = freshStoreItems.findIndex((i: any) => i.id === reqItem.id);
          if (idx === -1) {
            throw new Error(`Invalid item "${reqItem.title || reqItem.id}": Item does not exist in store catalog.`);
          }

          const targetStoreItem = freshStoreItems[idx];

          if (targetStoreItem.isHidden === true) {
            throw new Error(`Sorry, "${targetStoreItem.title}" is no longer available.`);
          }

          if (targetStoreItem.inStock === false) {
            throw new Error(`Sorry, "${targetStoreItem.title}" is currently out of stock.`);
          }

          const quantity = Math.max(1, Number(reqItem.quantity) || 1);

          if (!targetStoreItem.unlimitedStock && typeof targetStoreItem.stockQuantity === "number") {
            if (targetStoreItem.stockQuantity <= 0) {
              throw new Error(`Sorry, "${targetStoreItem.title}" is currently out of stock.`);
            }
            if (quantity > targetStoreItem.stockQuantity) {
              throw new Error(`Insufficient stock for "${targetStoreItem.title}". Only ${targetStoreItem.stockQuantity} unit(s) available.`);
            }

            // Deduct stock quantity atomically
            const newQty = targetStoreItem.stockQuantity - quantity;
            freshStoreItems[idx] = {
              ...targetStoreItem,
              stockQuantity: newQty,
              inStock: newQty > 0,
            };
            stockModified = true;
          }

          // Calculate server-authoritative effective price
          const basePrice = Number(targetStoreItem.price) || 0;
          const promoPrice = typeof targetStoreItem.discountPrice === "number" && targetStoreItem.discountPrice > 0
            ? targetStoreItem.discountPrice
            : typeof targetStoreItem.promoPrice === "number" && targetStoreItem.promoPrice > 0
            ? targetStoreItem.promoPrice
            : null;

          const serverEffectivePrice = promoPrice !== null && promoPrice < basePrice ? promoPrice : basePrice;

          if (serverEffectivePrice <= 0) {
            throw new Error(`Invalid server price for "${targetStoreItem.title}".`);
          }

          calculatedTotalAmount += serverEffectivePrice * quantity;

          finalOrderItems.push({
            id: targetStoreItem.id,
            title: String(targetStoreItem.title).trim(),
            price: serverEffectivePrice,
            costPrice: typeof targetStoreItem.costPrice === "number" ? targetStoreItem.costPrice : null,
            originalListPrice: basePrice,
            quantity,
            imageUrl: String(targetStoreItem.coverImageUrl || targetStoreItem.imageUrl || "").trim(),
            category: String(targetStoreItem.category || "General").trim(),
          });
        }

        if (calculatedTotalAmount <= 0) {
          throw new Error("Invalid total order amount.");
        }

        // 2. Read Wallet and User records inside transaction
        const freshWalletSnap = await transaction.get(walletRef);
        if (!freshWalletSnap.exists) {
          throw new Error("NGN wallet not found.");
        }

        const freshBal = Number(freshWalletSnap.data()?.balance) || 0;

        // IMPORTANT: Firestore requires every transaction read to complete before any transaction write.
        // Read the user document here, before updating wallet/store/order/ledger documents.
        const userSnap = await transaction.get(userRef);
        const userData = userSnap.exists ? userSnap.data() || {} : {};

        // PIN / Biometric Verification Guard
        const isUserBiometricEnabled = userData.isBiometricTransferEnabled === true || userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;
        const isBiometricAuth = isBiometricAuthenticated === true || body.isBiometric === true;

        if (isBiometricAuth && isUserBiometricEnabled) {
          // Biometric verified
        } else {
          const pinHash = userData.pinHash;
          const currentPlainPin = userData.pin;
          const lockedUntil = userData.lockedUntil;
          let pinAttempts = Number(userData.pinAttempts) || 0;

          if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
            const minutesLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / (60 * 1000));
            throw new Error(`Too many incorrect PIN attempts. Account locked for ${minutesLeft} minute(s).`);
          }

          let isPinMatch = false;
          if (uid === "mock-uid") {
            isPinMatch = pin === "1234" || pin === currentPlainPin || (Boolean(pin) && Boolean(pinHash) && bcrypt.compareSync(pin, pinHash));
          } else if (pin && pinHash) {
            isPinMatch = bcrypt.compareSync(pin, pinHash);
          } else if (pin && currentPlainPin) {
            isPinMatch = pin === currentPlainPin;
          }

          if (!isPinMatch) {
            pinAttempts += 1;
            let lockTimestamp = null;
            if (pinAttempts >= 5) {
              lockTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            }
            if (userSnap.exists) {
              transaction.update(userRef, {
                pinAttempts,
                lockedUntil: lockTimestamp,
              });
            }
            const remaining = Math.max(0, 5 - pinAttempts);
            throw new Error(
              pinAttempts >= 5
                ? "Too many incorrect PIN attempts. Account locked for 15 minutes."
                : `Incorrect transaction PIN. ${remaining} attempt(s) remaining.`
            );
          }
        }

        if (freshBal < calculatedTotalAmount) {
          throw new Error(`Insufficient wallet balance. Order total is ₦${calculatedTotalAmount.toLocaleString()}, but your balance is ₦${freshBal.toLocaleString()}. Please switch to 'Checkout with Card Payment'.`);
        }

        newBalance = freshBal - calculatedTotalAmount;

        // 3. All transaction writes happen only after all reads are complete.
        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: now,
        });

        if (userSnap.exists) {
          transaction.update(userRef, {
            balance: newBalance,
            updatedAt: now,
          });
        }

        // 4. Write Wallet Ledger Transaction
        const txRef = adminDb.collection("transactions").doc();
        const txId = txRef.id;
        transaction.set(txRef, {
          id: txId,
          userId: uid,
          type: "STORE_PURCHASE",
          category: "DEBIT",
          direction: "DEBIT",
          title: "Store Order",
          description: `Store Order ${orderId} (${finalOrderItems.length} items)`,
          amount: calculatedTotalAmount,
          totalDebited: calculatedTotalAmount,
          fee: 0,
          vat: 0,
          currency: "NGN",
          balanceBefore: freshBal,
          balanceAfter: newBalance,
          status: "SUCCESS",
          reference: orderId,
          orderId: orderId,
          transactionId: txId,
          paymentStatus: "PAID",
          orderStatus: "Pending",
          items: finalOrderItems,
          recipientName: "E-Tech Store",
          narration: `Store Order ${orderId} (${finalOrderItems.length} items)`,
          createdAt: now,
          updatedAt: now,
        });

        // 5. Write Store Order
        const newOrder = {
          id: orderId,
          userId: uid,
          customerName: String(customerName).trim(),
          customerEmail: String(customerEmail || userEmail).trim(),
          customerPhone: String(customerPhone).trim(),
          deliveryAddress: String(deliveryAddress).trim(),
          deliveryType: resolvedDeliveryType,
          items: finalOrderItems,
          totalAmount: calculatedTotalAmount,
          currency: "NGN",
          status: initialOrderStatus,
          adminNotes: "",
          paymentMethod: "WALLET_NGN",
          paymentChannel,
          paymentStatus: initialPaymentStatus,
          paymentVerificationRef,
          stockDeducted: true,
          stockRestored: false,
          transactionId: txId,
          createdAt: now,
          updatedAt: now,
        };

        transaction.set(orderRef, newOrder);

        // 6. Update Store Catalog Inventory Stock
        if (stockModified) {
          transaction.update(storeDataRef, { items: freshStoreItems, updatedAt: now });
        }
      });

      return NextResponse.json({
        success: true,
        message: "Store order placed successfully!",
        order: {
          id: orderId,
          userId: uid,
          customerName: String(customerName).trim(),
          customerEmail: String(customerEmail || userEmail).trim(),
          customerPhone: String(customerPhone).trim(),
          deliveryAddress: String(deliveryAddress).trim(),
          deliveryType: resolvedDeliveryType,
          items: finalOrderItems,
          totalAmount: calculatedTotalAmount,
          currency: "NGN",
          status: initialOrderStatus,
          paymentMethod: "WALLET_NGN",
          paymentChannel,
          paymentStatus: initialPaymentStatus,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  } catch (err: any) {
    console.error("[Store Order POST Exception]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to place store order" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    let uid = "";
    try {
      const authUser = await authenticateUserRequest(req);
      uid = authUser.uid;
    } catch {
      return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
    }

    // Trigger non-blocking 24h stale order cleanup routine
    autoCleanStaleAbandonedOrders().catch(() => {});

    const ordersSnap = await adminDb
      .collection("store_orders")
      .where("userId", "==", uid)
      .get();

    const orders: any[] = [];
    ordersSnap.forEach((doc) => {
      orders.push(doc.data());
    });

    // Sort newest first
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (err: any) {
    console.error("[Store Orders GET Exception]:", err.message);
    return NextResponse.json({ success: true, orders: [], count: 0 });
  }
}
