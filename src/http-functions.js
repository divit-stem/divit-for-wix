import wixPaymentProviderBackend from "wix-payment-provider-backend";
import { ok } from "wix-http-functions";
import { elevate } from "wix-auth";
import { secrets } from "wix-secrets-backend.v2";
import { orders, orderTransactions } from "wix-ecom-backend";
import crypto from "crypto";

const EVENT_ID_ORDER_PAID = 2001;
const EVENT_ID_ORDER_REFUND_APPROVED = 2100;
const EVENT_ID_ORDER_EXPIRED = 4001;
const EVENT_ID_ORDER_REFUND_CANCELLED = 4100;

const elevatedGetSecretValue = elevate(secrets.getSecretValue);
const elevatedGetOrder = elevate(orders.getOrder);
const elevatedListTransactionsForSingleOrder = elevate(
  orderTransactions.listTransactionsForSingleOrder,
);
const elevatedUpdatePaymentStatus = elevate(
  orderTransactions.updatePaymentStatus,
);

// callback endpoint for update transaction status
// https://<site-url>/_functions/updateDivitTransaction
// only return ok response for handled event, no retry.
// Restricted to POST requests to align with security best practices
export async function post_updateDivitTransaction(request) {
  const rawBody = await request.body.text();
  const req = JSON.parse(rawBody);

  divitLog("callback request", { reqest: req, query: request.query });

  if (!req.event || !req.eventData) {
    return ok({ body: "event or eventData is missing" });
  }

  const eventId = req.event.eventId;
  const eventDescription = req.event.eventDescription;

  const validEventIds = [
    EVENT_ID_ORDER_PAID,
    EVENT_ID_ORDER_REFUND_APPROVED,
    EVENT_ID_ORDER_EXPIRED,
    EVENT_ID_ORDER_REFUND_CANCELLED,
  ];

  if (!validEventIds.includes(eventId)) {
    return ok({ body: "event id is not supported " + String(eventId) });
  }

  let signatureKey;
  try {
    const isSandbox = request.query?.["sandbox"] === "true";
    const secretName = isSandbox ? "sandbox_divitSignatureKey" : "divitSignatureKey";
    const signatureKeySecret = await elevatedGetSecretValue(secretName);
    signatureKey = signatureKeySecret?.value;
  } catch (err) {
    divitLog("Failed to retrieve signature secret from Secrets Manager", err);
  }

  if (!signatureKey) {
    divitLog("Signature key is not configured on this site.");
    return ok({ body: "signature key is not configured" });
  }

  const headerSignature =
    request.headers["X-Divit-Signature"] ||
    request.headers["x-divit-signature"] ||
    "";

  const valid = validateWebhook(headerSignature, signatureKey, rawBody);

  if (!valid) {
    divitLog("callback sigature key is not valid");
    return ok({ body: "signature key is not valid" });
  }

  if (eventId === EVENT_ID_ORDER_PAID) {
    const wixTransactionId = req.eventData.MerchantRef;
    const pluginTransactionId = req.eventData.OrderID;
    try {
      await wixPaymentProviderBackend.submitEvent({
        event: {
          transaction: {
            wixTransactionId,
            pluginTransactionId,
          },
        },
      });
      return ok({ body: "order paid" });
    } catch (ex) {
      return ok({ body: { error: ex } });
    }
  } else if (eventId === EVENT_ID_ORDER_REFUND_APPROVED) {
    const wixTransactionId = req.eventData.partnerRef;
    const wixRefundId = request.query?.["wixRefundId"];
    const pluginRefundId = request.query?.["pluginRefundId"];
    const amount = String(req.eventData.refundAmount.amount);
    try {
      await wixPaymentProviderBackend.submitEvent({
        event: {
          refund: {
            wixTransactionId,
            wixRefundId,
            pluginRefundId,
            amount,
          },
        },
      });
      return ok({ body: "refund approved" });
    } catch (ex) {
      return ok({ body: { error: ex } });
    }
  } else if (eventId === EVENT_ID_ORDER_REFUND_CANCELLED) {
    const wixTransactionId = req.eventData.partnerRef;
    const wixRefundId = request.query?.["wixRefundId"];
    const pluginRefundId = request.query?.["pluginRefundId"];
    const amount = String(req.eventData.refundAmount.amount);
    try {
      await wixPaymentProviderBackend.submitEvent({
        event: {
          refund: {
            reasonCode: 3022,
            errorCode: String(eventId),
            errorMessage: eventDescription,
            wixTransactionId,
            wixRefundId,
            pluginRefundId,
            amount,
          },
        },
      });
      return ok({ body: "refund cancelled" });
    } catch (ex) {
      return ok({ body: { error: ex } });
    }
  } else if (eventId === EVENT_ID_ORDER_EXPIRED) {
    const wixTransactionId = req.eventData.partnerRef;
    const wixOrderId = request.query?.["wixOrderId"];
    try {
      const order = await elevatedGetOrder(wixOrderId);
      if (order.paymentStatus === orders.PaymentStatus.PAID) {
        return ok({ body: "order is paid" });
      }
      const transactions =
        await elevatedListTransactionsForSingleOrder(wixOrderId);
      // get matched payment id
      const payment = transactions.orderTransactions.payments.find((p) => {
        const payment = p.regularPaymentDetails;
        return (
          payment?.paymentProvider === "divit" &&
          payment?.gatewayTransactionId === wixTransactionId &&
          (payment?.status === orderTransactions.TransactionStatus.PENDING ||
            payment?.status === orderTransactions.TransactionStatus.UNDEFINED)
        );
      });
      if (payment) {
        const result = await elevatedUpdatePaymentStatus(
          { orderId: wixOrderId, paymentId: payment._id },
          { status: orderTransactions.TransactionStatus.CANCELED },
        );
        return ok({ body: "payment expired" });
      } else {
        return ok({ body: "payment not found" });
      }
    } catch (ex) {
      return ok({ body: { error: ex } });
    }
  } else {
    return ok({ body: "event id is not supported " + String(eventId) });
  }
}

function validateWebhook(signature, secret, body) {
  const strs = signature.split(",");
  if (strs.length !== 2) {
    return false;
  }

  const timestamp = strs[0].replace(/^t=/, "");
  const hmac = strs[1].replace(/^s1=/, "");
  if (!timestamp || !hmac) {
    return false;
  }

  const payload = `${timestamp}.${body}`;
  const calcHmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64");

  // Compare the calculated HMAC with the provided one
  return hmac === calcHmac;
}

function divitLog(...args) {
  console.log(...["[divit]"].concat(args));
}
