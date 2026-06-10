import { json } from "../utils/response.js";

import {
  getInvoiceByOrderNumber,
  createInvoiceRegistryRecord,
  getNextInvoiceSequence,
  incrementInvoiceCounter
} from "../services/invoiceRegistry.js";

import { renderInvoiceHtml } from "../services/invoiceRenderer.js";
import { uploadInvoicePdf } from "../services/pdfRenderer.js";
import productImages from "../../products_images.json";

function clean(value) {
  return String(value ?? "").trim();
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function countryName(code) {
  const countries = {
    DE: "Germany",
    SE: "Sweden",
    AT: "Austria",
    CH: "Switzerland",
    NL: "Netherlands",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    GB: "United Kingdom",
    US: "United States"
  };

  return countries[String(code || "").toUpperCase()] || code || "";
}

function extractRateFromTaxLine(taxLine) {
  if (taxLine?.rate !== undefined) {
    return `${Number(taxLine.rate) * 100}%`;
  }

  const match = String(taxLine?.title || "").match(/(\d+(?:[.,]\d+)?)%/);
  return match ? `${match[1].replace(",", ".")}%` : "19%";
}

function taxTitleWithoutRate(title) {
  return clean(title)
    .replace(/\s*\d+(?:[.,]\d+)?%/g, "")
    .trim();
}

async function verifyShopifyWebhook(request, rawBody, secret) {
  const provided = request.headers.get("x-shopify-hmac-sha256");

  if (!provided || !secret) {
    return false;
  }

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const computed = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return timingSafeEqual(computed, provided);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function normalizeWebhookOrder(order, invoiceNumber, invoiceSequence) {
  const orderNumber = Number(String(order.name || "").replace("#", ""));
  const billing = order.billing_address || {};

  const items = (order.line_items || []).map(line => {
    const taxLine = line.tax_lines?.[0] || {};
    const taxRate = extractRateFromTaxLine(taxLine);
    const taxFullTitle = clean(taxLine.title) || `MwSt ${taxRate}`;
    const taxTitle = taxTitleWithoutRate(taxFullTitle);

    const quantity = Number(line.quantity || 1);
    const unitPrice = money(line.price);
    const lineGross = money(Number(unitPrice) * quantity);
    const taxAmount = money(taxLine.price || 0);
    const lineNet = money(Number(lineGross) - Number(taxAmount));

    return {
      productImage:
        productImages[line.title || line.name] ||
        line.image ||
        "",
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
    const rawBody = await request.text();

    const isValid = await verifyShopifyWebhook(
      request,
      rawBody,
      env.SHOPIFY_WEBHOOK_SECRET
    );

    if (!isValid) {
      return json({ error: "Invalid Shopify webhook signature" }, 401);
    }

    const topic = request.headers.get("x-shopify-topic");
    const webhookId =
      request.headers.get("x-shopify-webhook-id") ||
      request.headers.get("x-shopify-event-id");

    const order = JSON.parse(rawBody);
    const orderNumber = Number(String(order.name || "").replace("#", ""));

    if (!orderNumber) {
      return json({ error: "Missing Shopify order number" }, 400);
    }

    const isDryRun =
      request.headers.get("x-shopify-test") === "true" ||
      order.test === true;

    const financialStatus =
      String(order.financial_status || "").toLowerCase();

    if (isDryRun) {
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
        file_url: existing.pdf_url,
        existing: true
      });
    }

    const invoiceSequence = await getNextInvoiceSequence(env);
    const invoiceNumber = `${env.INVOICE_PREFIX}${invoiceSequence}`;

    const invoiceData = normalizeWebhookOrder(
      order,
      invoiceNumber,
      invoiceSequence
    );

    const invoiceHtml = renderInvoiceHtml(invoiceData);

    const htmlFileName = `invoices/${invoiceNumber}.html`;

    await env.INVOICES.put(htmlFileName, invoiceHtml, {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
        contentDisposition:
          `inline; filename="${invoiceNumber}.html"`
      }
    });

    const htmlFileUrl = `${env.PUBLIC_BUCKET_URL}/${htmlFileName}`;

    const pdfResult = await uploadInvoicePdf(env, {
      invoiceNumber,
      invoiceHtml
    });

    const fileUrl = pdfResult.fileUrl;

    await createInvoiceRegistryRecord(env, {
      shopifyOrderId: invoiceData.shopifyOrderId,
      orderNumber: invoiceData.orderNumber,
      invoiceSequence,
      invoiceNumber,
      fileUrl,
      source: `shopify_webhook:${topic || "unknown"}:${webhookId || "no-id"}`,
      issuedAt: invoiceData.issuedAt,
      customerName: invoiceData.customerName || null,
      customerEmail: invoiceData.customerEmail || null,
      totalAmount: invoiceData.totalGross || null
    });

    await incrementInvoiceCounter(env);

    return json({
      success: true,
      order_number: invoiceData.orderNumber,
      invoice_sequence: invoiceSequence,
      invoice_number: invoiceNumber,
      file_url: fileUrl,
      html_file_url: htmlFileUrl
    });

  } catch (error) {
    return json({
      error: "Shopify webhook failed",
      message: error.message
    }, 500);
  }
}