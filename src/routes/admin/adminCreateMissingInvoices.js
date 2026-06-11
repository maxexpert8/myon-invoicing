import { json } from "../../utils/response.js";
import productImages from "../../../products_images.json";

import {
  getInvoiceByOrderNumber,
  createInvoiceRegistryRecord,
  allocateInvoiceSequence
} from "../../services/invoiceRegistry.js";

import { renderInvoiceHtml } from "../../services/invoiceRenderer.js";
import { uploadInvoicePdf } from "../../services/pdfRenderer.js";

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function isAuthorized(request, env) {
  const manualSecret = request.headers.get("x-manual-secret");

  if (
    manualSecret &&
    env.MANUAL_SECRET &&
    timingSafeEqual(manualSecret, env.MANUAL_SECRET)
  ) {
    return true;
  }

  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");

  if (!hmac || !env.SHOPIFY_WEBHOOK_SECRET) {
    return false;
  }

  const params = new URLSearchParams(url.search);
  params.delete("hmac");
  params.delete("signature");

  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  const computed = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(computed, hmac);
}

async function fetchRecentPaidOrders(env) {
  const response = await fetch(
    `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/orders.json?status=any&financial_status=paid&limit=50&order=created_at%20desc`,
    {
      headers: {
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_TOKEN
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data.orders || [];
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

function normalizeOrder(order, invoiceNumber, invoiceSequence) {
  const billing = order.billing_address || {};
  const orderNumber = Number(String(order.name || "").replace("#", ""));

  const items = (order.line_items || []).map(line => {
    const taxLine = line.tax_lines?.[0] || {};
    const taxRate = taxLine.rate !== undefined
      ? `${Number(taxLine.rate) * 100}%`
      : "";

    const quantity = Number(line.quantity || 1);
    const unitPrice = money(line.price);
    const lineGross = money(Number(unitPrice) * quantity);
    const taxAmount = money(taxLine.price || 0);
    const lineNet = money(Number(lineGross) - Number(taxAmount));

    return {
      productImage: productImages[line.title || line.name] || line.image || "",
      productName: line.title || line.name || "Produkt",
      quantity,
      taxTitle: String(taxLine.title || "").replace(/\s*\d+(?:[.,]\d+)?%/g, "").trim(),
      taxRate,
      taxFullTitle: taxLine.title || "",
      unitPrice,
      lineNet,
      taxAmount,
      lineGross
    };
  });

  const vatSummaryMap = new Map();

  for (const item of items) {
    const title = item.taxFullTitle || "MwSt";
    if (!vatSummaryMap.has(title)) {
      vatSummaryMap.set(title, {
        title,
        rate: item.taxRate,
        amount: 0
      });
    }

    vatSummaryMap.get(title).amount += Number(item.taxAmount || 0);
  }

  const vatSummary = Array.from(vatSummaryMap.values()).map(vat => ({
    title: vat.title,
    rate: vat.rate,
    amount: money(vat.amount)
  }));

  return {
    orderNumber,
    shopifyOrderId: String(order.id),
    invoiceSequence,
    invoiceNumber,
    issuedAt: order.processed_at || order.created_at || new Date().toISOString(),
    invoiceCreatedAt: new Date().toISOString(),

    customerName: billing.name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
    customerFullName: billing.name || "",
    customerEmail: order.email || order.contact_email || order.customer?.email || "",

    billingName: billing.name || "",
    billingCompany: billing.company || "",
    billingAddress1: billing.address1 || "",
    billingAddress2: billing.address2 || "",
    billingCity: billing.city || "",
    billingZip: billing.zip || "",
    billingCountry: billing.country_code || "",
    billingCountryName: billing.country || countryName(billing.country_code),

    primaryTaxTitle: vatSummary[0]?.title || "",
    items,
    vatSummary,

    totalGross: money(order.total_price),
    totalNet: money(Number(order.total_price || 0) - Number(order.total_tax || 0)),
    vatAmount: money(order.total_tax),
    vatRate: vatSummary[0]?.rate || "",
    outstandingAmount: money(order.total_outstanding || 0),
    paymentMethod: (order.payment_gateway_names || []).join(", ") || "Shopify Payments"
  };
}

export async function handleAdminCreateMissingInvoices(request, env) {
  if (!(await isAuthorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const orders = await fetchRecentPaidOrders(env);
    const results = [];

    for (const order of orders) {
      const orderNumber = Number(String(order.name || "").replace("#", ""));

      if (!orderNumber || orderNumber < 1050) continue;

      const existing = await getInvoiceByOrderNumber(env, orderNumber);

      if (existing) {
        results.push({
          order_number: orderNumber,
          status: "skipped_existing",
          invoice_number: existing.invoice_number
        });
        continue;
      }

      const invoiceSequence = await allocateInvoiceSequence(env);
      const invoiceNumber = `${env.INVOICE_PREFIX}${invoiceSequence}`;

      const invoiceData = normalizeOrder(order, invoiceNumber, invoiceSequence);
      const invoiceHtml = renderInvoiceHtml(invoiceData);

      const htmlFileName = `invoices/${invoiceNumber}.html`;

      await env.INVOICES.put(htmlFileName, invoiceHtml, {
        httpMetadata: {
          contentType: "text/html; charset=utf-8",
          contentDisposition: `inline; filename="${invoiceNumber}.html"`
        }
      });

      const pdfResult = await uploadInvoicePdf(env, {
        invoiceNumber,
        invoiceHtml
      });

      await createInvoiceRegistryRecord(env, {
        shopifyOrderId: invoiceData.shopifyOrderId,
        orderNumber: invoiceData.orderNumber,
        invoiceSequence,
        invoiceNumber,
        fileUrl: pdfResult.fileUrl,
        source: "admin_reconcile_auto_create",
        issuedAt: invoiceData.issuedAt,
        customerName: invoiceData.customerName || null,
        customerEmail: invoiceData.customerEmail || null,
        totalAmount: invoiceData.totalGross || null
      });

      results.push({
        order_number: orderNumber,
        status: "created",
        invoice_number: invoiceNumber,
        pdf_url: pdfResult.fileUrl
      });
    }

    return json({
      success: true,
      created_count: results.filter(r => r.status === "created").length,
      results
    });

  } catch (error) {
    return json({
      error: "Create missing invoices failed",
      message: error.message
    }, 500);
  }
}
