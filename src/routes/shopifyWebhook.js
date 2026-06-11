import { json } from "../utils/response.js";
import { verifyHmacSha256Base64 } from "../utils/security.js";
import { getProductImage, countryName } from "../utils/invoiceDataHelpers.js";

import {
  getInvoiceByOrderNumber,
  allocateInvoiceSequence,
  createPendingInvoiceRegistryRecord,
  markInvoiceFailed,
  markInvoiceIssued,
  markInvoicePending
} from "../services/invoiceRegistry.js";

import { renderInvoiceHtml } from "../services/invoiceRenderer.js";
import { uploadInvoicePdf } from "../services/pdfRenderer.js";

function clean(value) {
  return String(value ?? "").trim();
}

function money(value) {
  return Number(value || 0).toFixed(2);
}


function extractRateFromTaxLine(taxLine) {
  if (taxLine?.rate !== undefined) {
    return `${Number(taxLine.rate) * 100}%`;
  }

  const match = String(taxLine?.title || "").match(/(\d+(?:[.,]\d+)?)%/);
  return match ? `${match[1].replace(",", ".")}%` : "19%";
}

function taxTitleWithoutRate(title) {
  return clean(title).replace(/\s*\d+(?:[.,]\d+)?%/g, "").trim();
}

async function verifyShopifyWebhook(request, rawBodyBuffer, secret) {
  return await verifyHmacSha256Base64({
    secret,
    payload: rawBodyBuffer,
    signature: request.headers.get("x-shopify-hmac-sha256")
  });
}


function normalizeWebhookOrder(order, invoiceNumber, invoiceSequence) {
  const orderNumber = Number(String(order.name || "").replace("#", ""));
  const billing = order.billing_address || {};

  const lineItems = Array.isArray(order.line_items) ? order.line_items.slice(0, 100) : [];

  const items = lineItems.map(line => {
    const taxLines = Array.isArray(line.tax_lines) ? line.tax_lines : [];
    const taxLine = taxLines[0] || {};
    const taxRate = extractRateFromTaxLine(taxLine);
    const taxFullTitle = clean(taxLine.title) || `MwSt ${taxRate}`;
    const taxTitle = taxTitleWithoutRate(taxFullTitle);

    const quantity = Number(line.quantity || 1);
    const unitPrice = money(line.price);
    const lineGross = money(Number(unitPrice) * quantity);
    const taxAmount = money(taxLine.price || 0);
    const lineNet = money(Number(lineGross) - Number(taxAmount));

    return {
      productImage: getProductImage(line),
      productName: line.title || line.name || "Produkt",
      quantity,
      taxTitle,
      taxRate,
      taxFullTitle,
      unitPrice,
      lineNet,
      taxAmount,
      lineGross
    };
  });

  const vatMap = new Map();

  for (const item of items) {
    const title = item.taxFullTitle;
    if (!vatMap.has(title)) {
      vatMap.set(title, {
        title,
        rate: item.taxRate,
        amount: 0
      });
    }

    vatMap.get(title).amount += Number(item.taxAmount || 0);
  }

  const vatSummary = Array.from(vatMap.values()).map(vat => ({
    title: vat.title,
    rate: vat.rate,
    amount: money(vat.amount)
  }));

  const firstTaxTitle = vatSummary[0]?.title || "DE MwSt 19%";

  return {
    orderNumber,
    shopifyOrderId: String(order.id),
    invoiceSequence,
    invoiceNumber,
    issuedAt: order.processed_at || order.created_at || new Date().toISOString(),
    invoiceCreatedAt: new Date().toISOString(),

    customerName: billing.name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
    customerFullName: billing.name || "",
    customerEmail: order.email || order.customer?.email || "",

    billingName: billing.name || "",
    billingCompany: billing.company || "",
    billingAddress1: billing.address1 || "",
    billingAddress2: billing.address2 || "",
    billingCity: billing.city || "",
    billingZip: billing.zip || "",
    billingCountry: billing.country_code || "",
    billingCountryName: billing.country || countryName(billing.country_code),

    paymentMethod: (order.payment_gateway_names || []).join(", ") || "Shopify Payments",

    primaryTaxTitle: firstTaxTitle,
    items,
    vatSummary,

    totalGross: money(order.total_price),
    totalNet: money(Number(order.total_price || 0) - Number(order.total_tax || 0)),
    vatAmount: money(order.total_tax),
    vatRate: vatSummary[0]?.rate || "19%",
    outstandingAmount: money(order.total_outstanding || 0)
  };
}

export async function handleShopifyWebhook(request, env) {
  try {
    const rawBodyBuffer = await request.arrayBuffer();
    const isValid = await verifyShopifyWebhook(
      request,
      rawBodyBuffer,
      env.SHOPIFY_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.log("Shopify webhook rejected: invalid signature", {
        providedLength: request.headers.get("x-shopify-hmac-sha256")?.length || 0,
        topic: request.headers.get("x-shopify-topic"),
        webhookId: request.headers.get("x-shopify-webhook-id") || request.headers.get("x-shopify-event-id"),
        isTest: request.headers.get("x-shopify-test") === "true",
        hasHmac: Boolean(request.headers.get("x-shopify-hmac-sha256")),
        hasSecret: Boolean(env.SHOPIFY_WEBHOOK_SECRET)
      });

      return json({ error: "Invalid Shopify webhook signature" }, 401);
    }

    const rawBody = new TextDecoder().decode(rawBodyBuffer);
    const topic = request.headers.get("x-shopify-topic");
    const webhookId = request.headers.get("x-shopify-webhook-id") || request.headers.get("x-shopify-event-id");
    
    let order;

    try {
      order = JSON.parse(rawBody);
    } catch (error) {
      console.warn("Shopify webhook rejected: malformed JSON", {
        message: error?.message,
        topic: request.headers.get("x-shopify-topic"),
        webhookId:
          request.headers.get("x-shopify-webhook-id") ||
          request.headers.get("x-shopify-event-id")
      });

      return json({
        error: "Malformed Shopify webhook JSON"
      }, 400);
    }
    
    if (!order || typeof order !== "object" || Array.isArray(order)) {
      return json({
        error: "Invalid Shopify webhook payload"
      }, 400);
    }

    const orderNumber = Number(String(order.name || "").replace("#", ""));

    if (!orderNumber) {
      return json({ error: "Missing Shopify order number" }, 400);
    }

    const isDryRun = request.headers.get("x-shopify-test") === "true" || order.test === true;
    const financialStatus = String(order.financial_status || "").toLowerCase();

    console.log("Shopify webhook received", {
      topic,
      webhookId,
      orderNumber,
      isDryRun,
      financialStatus
    });

    if (isDryRun) {
      console.log("Shopify webhook dry-run skipped", {
        topic,
        orderNumber,
        financialStatus
      });
      return json({
        success: true,
        dry_run: true,
        message: "Shopify test webhook received. No invoice created.",
        topic,
        order_number: orderNumber,
        financial_status: financialStatus
      });
    }

    if (financialStatus !== "paid") {
      console.log("Shopify webhook unpaid skipped", {
        topic,
        orderNumber,
        financialStatus
      });
      return json({
        success: true,
        skipped: true,
        reason: "Order is not paid",
        topic,
        order_number: orderNumber,
        financial_status: financialStatus
      });
    }

    const existing = await getInvoiceByOrderNumber(env, orderNumber);

    if (existing) {
      return json({
        success: true,
        message: "Invoice already exists",
        order_number: orderNumber,
        invoice_number: existing.invoice_number,
        file_url: existing.pdf_key || existing.pdf_url,
        status: existing.status,
        existing: true
      });
    }

    if (!env.INVOICE_QUEUE) {
      return json({
        error: "Missing invoice queue binding"
      }, 500);
    }

    console.log("Shopify webhook queueing invoice", {
      topic,
      webhookId,
      orderNumber
    });

    await env.INVOICE_QUEUE.send({
      order,
      topic,
      webhookId,
      receivedAt: new Date().toISOString()
    });

    return json({
      success: true,
      queued: true,
      topic,
      webhook_id: webhookId || null,
      order_number: orderNumber,
      financial_status: financialStatus
    }, 202);

  } catch (error) {
    console.error("Shopify webhook failed", {
      message: error?.message,
      name: error?.name,
      stack: error?.stack
    });
    return json({
      error: "Shopify webhook failed",
      message: error.message
    }, 500);
  }
}

export async function processShopifyInvoiceQueueMessage(message, env) {
  const {
    order,
    topic,
    webhookId
  } = message;

  const orderNumber = Number(String(order?.name || "").replace("#", ""));

  if (!orderNumber) {
    return {
      skipped: true,
      reason: "Missing Shopify order number"
    };
  }

  const existing = await getInvoiceByOrderNumber(env, orderNumber);

  if (existing?.status === "issued") {
    return {
      skipped: true,
      reason: "Invoice already issued",
      order_number: orderNumber,
      invoice_number: existing.invoice_number
    };
  }

  const invoiceSequence = existing?.invoice_sequence
    ? Number(existing.invoice_sequence)
    : await allocateInvoiceSequence(env);

  const invoiceNumber = existing?.invoice_number ||
    `${env.INVOICE_PREFIX}${invoiceSequence}`;

  const invoiceData = normalizeWebhookOrder(
    order,
    invoiceNumber,
    invoiceSequence
  );

  if (existing) {
    await markInvoicePending(env, invoiceNumber);
  } else {
    await createPendingInvoiceRegistryRecord(env, {
      shopifyOrderId: invoiceData.shopifyOrderId,
      orderNumber: invoiceData.orderNumber,
      invoiceSequence,
      invoiceNumber,
      source: `shopify_webhook:${topic || "unknown"}:${webhookId || "no-id"}`,
      issuedAt: invoiceData.issuedAt,
      customerName: invoiceData.customerName || null,
      customerEmail: invoiceData.customerEmail || null,
      totalAmount: invoiceData.totalGross || null
    });
  }

  try {
    const invoiceHtml = renderInvoiceHtml(invoiceData);

    const htmlFileName = `invoices/${invoiceNumber}.html`;

    await env.INVOICES.put(htmlFileName, invoiceHtml, {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
        contentDisposition:
          `inline; filename="${invoiceNumber}.html"`
      }
    });

    const pdfResult = await uploadInvoicePdf(env, {
      invoiceNumber,
      invoiceHtml
    });

    const pdfKey = pdfResult.pdfKey;

    await markInvoiceIssued(env, {
      invoiceNumber,
      pdfKey,
    });

    return {
      success: true,
      order_number: invoiceData.orderNumber,
      invoice_sequence: invoiceSequence,
      invoice_number: invoiceNumber,
      file_url: pdfKey,
      html_file_url: htmlFileName
    };

  } catch (error) {
    await markInvoiceFailed(env, {
      invoiceNumber,
      errorMessage: error.message
    });

    throw error;
  }
}
