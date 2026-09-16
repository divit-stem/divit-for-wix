import { elevate } from "wix-auth";
import { fetch } from "wix-fetch";
import { secrets } from "wix-secrets-backend.v2";
import crypto from "crypto";
import { WEBSITE_URL } from "backend/divit-constants";

const getBaseApiUrl = (credentials) => {
  const isSandbox = credentials?.sandbox === "true" || credentials?.sandbox === true;
  return isSandbox ? "https://sandbox-api.divit.dev" : "https://api.divit.com.hk";
};

const getApiKey = (credentials) => {
  const isSandbox = credentials?.sandbox === "true" || credentials?.sandbox === true;
  return isSandbox ? credentials.sandboxApiKey : credentials.apiKey;
};

const elevatedListSecretInfo = elevate(secrets.listSecretInfo);
const elevatedCreateSecret = elevate(secrets.createSecret);
const elevatedUpdateSecretValue = elevate(secrets.updateSecret);

const upsertSecret = async (secret) => {
  const allSecrets = (await elevatedListSecretInfo()).secrets;
  const found = allSecrets.find((s) => s.name === secret.name);
  if (found) {
    await elevatedUpdateSecretValue(found._id, secret);
  } else {
    await elevatedCreateSecret(secret);
  }
};

/**
 * This payment plugin endpoint is triggered when a merchant provides required data to connect their PSP account to a Wix site.
 * The plugin has to verify merchant's credentials, and ensure the merchant has an operational PSP account.
 * @param {import('interfaces-psp-v1-payment-service-provider').ConnectAccountOptions} options
 * @param {import('interfaces-psp-v1-payment-service-provider').Context} context
 * @returns {Promise<import('interfaces-psp-v1-payment-service-provider').ConnectAccountResponse | import('interfaces-psp-v1-payment-service-provider').BusinessError>}
 */
export const connectAccount = async (options, context) => {
  // Querying the /directpay/profile endpoint serves two purposes:
  // 1. Validates the merchant's API Key against the divit API.
  // 2. Retrieves 'branchID' and 'merchantID' to map as 'accountId' and 'accountName' respectively.
  // Wix requires returning these fields to show connection details on the Wix Dashboard.
  // Note: These IDs are NOT needed or used in the createTransaction, refundTransaction, or Webhook workflows.
  const baseApiUrl = getBaseApiUrl(options.credentials);
  const apiKey = getApiKey(options.credentials);
  const getMerchantUrl = baseApiUrl + "/directpay/profile";

  let returnObj = {
    credentials: options.credentials,
  };

  try {
    const response = await fetch(getMerchantUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "API-Key": apiKey,
      },
    });

    const data = await response.json();

    if (response.status === 200 && data.code === 0) {
      const isSandbox = options.credentials.sandbox === "true" || options.credentials.sandbox === true;
      if (isSandbox) {
        if (options.credentials.sandboxSignatureKey) {
          await upsertSecret({
            name: "sandbox_divitSignatureKey",
            value: options.credentials.sandboxSignatureKey,
            description: "divit sandbox payment signature key",
          });
        }
      } else {
        if (options.credentials.signatureKey) {
          await upsertSecret({
            name: "divitSignatureKey",
            value: options.credentials.signatureKey,
            description: "divit production payment signature key",
          });
        }
      }
      returnObj.accountId = data.data.branchID;
      returnObj.accountName = data.data.merchantID;
    } else {
      returnObj.errorCode = String(data.code || response.status);
      returnObj.errorMessage =
        data.message || "Api Key is not correct with divit";
      returnObj.reasonCode = 2004; // Wix standard: 2004 (Merchant authorization failed)
    }
  } catch (err) {
    divitLog("connectAccount fetch exception", err);
    returnObj.errorCode = "CONNECTION_ERROR";
    returnObj.errorMessage = "Failed to connect to divit servers. Please verify DNS resolution or network connectivity: " + err.message;
    returnObj.reasonCode = 6000; // Wix standard fallback: 6000 (General error)
  }

  return returnObj;
};

/**
 * This payment plugin endpoint is triggered when a buyer pays on a Wix site.
 * The plugin has to process this payment request but prevent double payments for the same `wixTransactionId`.
 * @param {import('interfaces-psp-v1-payment-service-provider').CreateTransactionOptions} options
 * @param {import('interfaces-psp-v1-payment-service-provider').Context} context
 * @returns {Promise<import('interfaces-psp-v1-payment-service-provider').CreateTransactionResponse | import('interfaces-psp-v1-payment-service-provider').BusinessError>}
 */
export const createTransaction = async (options, context) => {
  if (options.order.description.currency !== "HKD") {
    return {
      errorCode: "400",
      errorMessage: "divit only support currency: HKD",
      reasonCode: 1006, // Wix standard: 1006 (Request is not allowed)
    };
  }

  const baseApiUrl = getBaseApiUrl(options.merchantCredentials);
  const apiKey = getApiKey(options.merchantCredentials);
  const createOrderUrl = baseApiUrl + "/directpay/o/order";

  const wixOrderId = options.order._id;
  const transactionId = options.wixTransactionId;
  const language = options.order.description.buyerInfo.buyerLanguage;
  const totalAmount = parseFloat(options.order.description.totalAmount);
  const currency = options.order.description.currency;
  const lineItems = options.order.description.items.map((item) => ({
    itemType: "retail",
    itemData: {
      productID: item._id,
      productTitle: item.name,
      qty: item.quantity,
      unitPrice: wixAmountToHKD(item.price),
      subtotal: wixAmountToHKD(item.price) * item.quantity,
      pics: {
        big: "",
        small: "",
      },
    },
  }));
  const webhookSuccess = options.order.returnUrls.successUrl;
  const webhookFailure = options.order.returnUrls.errorUrl;
  
  const isSandbox = options.merchantCredentials?.sandbox === "true" || options.merchantCredentials?.sandbox === true;
  const queryParams = { wixOrderId, lang: language };
  if (isSandbox) {
    queryParams.sandbox = "true";
  }
  const query = buildQueryString(queryParams);
  const paymentUrl = cleanUrl(
    WEBSITE_URL + "/_functions/updateDivitTransaction",
  );
  const webhookEvents = paymentUrl + query;

  const customer = {
    firstName: options.order.description.billingAddress.firstName,
    lastName: options.order.description.billingAddress.lastName,
    email: options.order.description.billingAddress.email,
    tel: options.order.description.billingAddress.phone,
    address1: options.order.description.billingAddress.address,
    address2: "",
    district: options.order.description.billingAddress.city,
    province: options.order.description.billingAddress.state,
    postalCode: options.order.description.billingAddress.zipCode,
    country: options.order.description.billingAddress.countryCode,
    language,
  };

  const order = {
    totalAmount: {
      amount: totalAmount,
      currency: currency,
    },
    merchantRef: transactionId,
    merchantUniqueOrderID: transactionId,
    orderType: "retail",
    orderItems: lineItems,
    webhookSuccess: webhookSuccess,
    webhookFailure: webhookFailure,
    webhookEvents: webhookEvents,
    source: "wix",
  };

  const postData = {
    customer,
    order,
  };

  const response = await fetch(createOrderUrl, {
    method: "post",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "API-Key": apiKey,
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();

  if (response.status === 200 && data.code === 0) {
    const pluginTransactionId = data.data.orderID;
    const redirectUrl = data.data.redirectURI;
    return {
      pluginTransactionId,
      redirectUrl,
    };
  } else {
    divitLog("createTransaction error", data);
    return {
      errorCode: String(data.code || response.status),
      errorMessage: data.message || "Fail to create order with divit",
      reasonCode: 2001,
    };
  }
};

/**
 * This payment plugin endpoint is triggered when a merchant refunds a payment made on a Wix site.
 * Since divit refunds require manual staff approval, we implement an asynchronous 2-step refund:
 * 
 * Step 1 (This function):
 * We initiate the refund request on divit. Instead of returning 'pluginRefundId' immediately (which
 * would mark the refund as completed on Wix), we return 'reasonCode: 5009' (Pending general).
 * This tells Wix that the refund is pending.
 * We generate a 'pluginRefundId' locally and pass it in the callbackURI query string, so when divit
 * approves the refund and triggers our webhook callback, we can retrieve it and notify Wix.
 * 
 * Step 2 (http-functions.js):
 * Upon staff approval, divit calls our webhook which submits the refund-completed event to Wix,
 * completing the refund flow and updating the Wix Dashboard status.
 * 
 * @param {import('interfaces-psp-v1-payment-service-provider').RefundTransactionOptions} options
 * @param {import('interfaces-psp-v1-payment-service-provider').Context} context
 * @returns {Promise<import('interfaces-psp-v1-payment-service-provider').CreateRefundResponse | import('interfaces-psp-v1-payment-service-provider').BusinessError>}
 */
export const refundTransaction = async (options, context) => {
  const baseApiUrl = getBaseApiUrl(options.merchantCredentials);
  const apiKey = getApiKey(options.merchantCredentials);
  const refundUrl = baseApiUrl + "/paynow/orders/refund/request";

  // Generate the refund tracking ID locally to pass as state-tracking query params in callbackURI
  const pluginRefundId = crypto.randomUUID();
  const refundAmount = wixAmountToHKD(options.refundAmount);
  const remarks = options.refundReason;
  const wixTransactionId = options.wixTransactionId;
  const wixRefundId = options.wixRefundId;
  const orderID = options.pluginTransactionId;

  const isSandbox = options.merchantCredentials?.sandbox === "true" || options.merchantCredentials?.sandbox === true;
  const queryParams = {
    wixTransactionId,
    wixRefundId,
    pluginRefundId,
  };
  if (isSandbox) {
    queryParams.sandbox = "true";
  }
  const query = buildQueryString(queryParams);
  const callbackURI =
    cleanUrl(WEBSITE_URL + "/_functions/updateDivitTransaction") + query;

  const postData = {
    orderID,
    refundType: "partial",
    refundRef: wixRefundId,
    remarks,
    refundAmount,
    callbackURI,
  };

  const response = await fetch(refundUrl, {
    method: "post",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "API-Key": apiKey,
    },
    body: JSON.stringify(postData),
  });

  const data = await response.json();

  if (response.status === 200 && data.code === 0) {
    return {
      // Return Pending general to instruct Wix to set the dashboard refund state to "Pending"
      reasonCode: 5009,
    };
  } else {
    divitLog("refundTransaction error", data);
    return {
      errorCode: String(data.code || response.status),
      errorMessage: data.message || "Fail to refund order with divit",
      reasonCode: 3022, // Wix standard: 3022 (Refund not allowed)
    };
  }
};

const wixAmountToHKD = (amount) => {
  return parseFloat(amount) / Math.pow(10, 2);
};

const cleanUrl = (url) => {
  return url.replace(/(?<!https?:)\/\/+/g, "/");
};

function buildQueryString(params) {
  return params && typeof params === "object"
    ? "?" +
        Object.entries(params)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&")
    : "";
}

function divitLog(...args) {
  console.log(...["[divit]"].concat(args));
}
