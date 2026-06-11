import { json } from "../../utils/response.js";
import { withTimeout } from "../../utils/asyncGuards.js";
import { getProductImage, countryName } from "../../utils/invoiceDataHelpers.js";

import { parseMigrationCsv } from "../../services/csvMigration.js";
import { getInvoiceByOrderNumber} from "../../services/invoiceRegistry.js";
import { renderInvoiceHtml } from "../../services/invoiceRenderer.js";
import { uploadInvoicePdf } from "../../services/pdfRenderer.js";


function delay(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function buildBillingAddress(order) {
  return [
    order.billingAddress1,
    order.billingAddress2,
    `${order.billingZip} ${order.billingCity}`.trim(),
    order.billingCountryName || order.billingCountry
  ]
    .filter(Boolean)
    .join(", ");
}

function buildInvoiceData(order, existingInvoice) {
  return {
    orderNumber:
      order.orderNumber,

    invoiceNumber:
      existingInvoice.invoice_number,

    issuedAt:
      order.issuedAt,

    invoiceCreatedAt:
      new Date().toISOString(),

    customerName:
      order.customerName,

    customerFullName:
      order.customerFullName,

    customerEmail:
      order.customerEmail,

    billingAddress:
      buildBillingAddress(order),

    billingName:
      order.billingName,

    billingCompany:
      order.billingCompany,

    billingAddress1:
      order.billingAddress1,

    billingAddress2:
      order.billingAddress2,

    billingCity:
      order.billingCity,

    billingZip:
      order.billingZip,

    billingCountry:
      order.billingCountry,

    billingCountryName:
      order.billingCountryName,

    primaryTaxTitle:
      order.primaryTaxTitle,

    items:
      order.items || [],

    vatSummary:
      order.vatSummary || [],

    totalGross:
      order.totalGross,

    totalNet:
      order.totalNet,

    vatAmount:
      order.vatAmount,

    vatRate:
      order.vatRate,

    outstandingAmount:
      order.outstandingAmount,

    paymentMethod:
      order.paymentMethod
  };
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
  return String(title || "")
    .trim()
    .replace(/\s*\d+(?:[.,]\d+)?%/g, "")
    .trim();
}

async function getInvoiceByInvoiceNumber(env, invoiceNumber) {
  return await env.DB.prepare(`
    SELECT *
    FROM invoice_registry
    WHERE invoice_number = ?
    LIMIT 1
  `)
    .bind(invoiceNumber)
    .first();
}

async function fetchShopifyOrderById(env, shopifyOrderId) {
  const response = await withTimeout(
  fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/orders/${shopifyOrderId}.json?status=any`,
    {
      headers: {
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_TOKEN
      }
    }
  ), 15000, "Shopify API request");

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data.order;
}

function hasUsefulAddress(address = {}) {
  return Boolean(
    address.name ||
    address.first_name ||
    address.last_name ||
    address.company ||
    address.address1 ||
    address.address2 ||
    address.city ||
    address.zip
  );
}

function normalizeAddress(address = {}) {
  return {
    name:
      address.name ||
      `${address.first_name || ""} ${address.last_name || ""}`.trim(),
    company: address.company || "",
    address1: address.address1 || "",
    address2: address.address2 || "",
    city: address.city || "",
    zip: address.zip || "",
    countryCode: address.country_code || "",
    countryName: address.country || address.country_name || ""
  };
}

function getBestBillingAddress(order) {
  if (hasUsefulAddress(order.billing_address)) {
    return normalizeAddress(order.billing_address);
  }

  if (hasUsefulAddress(order.customer?.default_address)) {
    return normalizeAddress(order.customer.default_address);
  }

  if (hasUsefulAddress(order.shipping_address)) {
    return normalizeAddress(order.shipping_address);
  }

  return normalizeAddress(order.billing_address || {});
}

function buildInvoiceDataFromShopifyOrder(order, existingInvoice) {
  const billing = getBestBillingAddress(order);
  const orderNumber = Number(String(order.name || existingInvoice.shopify_order_number || "").replace("#", ""));

  const items = (order.line_items || []).map(line => {
    const taxLine = line.tax_lines?.[0] || {};
    const taxRate = extractRateFromTaxLine(taxLine);
    const taxFullTitle = String(taxLine.title || "").trim() || `MwSt ${taxRate}`;
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

  return {
    orderNumber,
    shopifyOrderId: String(order.id),
    invoiceSequence: existingInvoice.invoice_sequence,
    invoiceNumber: existingInvoice.invoice_number,
    issuedAt: order.processed_at || order.created_at || existingInvoice.issued_at,
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
    billingCountry: billing.countryCode || "",
    billingCountryName: billing.countryName || countryName(billing.countryCode),

    primaryTaxTitle: vatSummary[0]?.title || "DE MwSt 19%",
    items,
    vatSummary,

    totalGross: money(order.total_price),
    totalNet: money(Number(order.total_price || 0) - Number(order.total_tax || 0)),
    vatAmount: money(order.total_tax),
    vatRate: vatSummary[0]?.rate || "19%",
    outstandingAmount: money(order.total_outstanding || 0),
    paymentMethod: (order.payment_gateway_names || []).join(", ") || "Shopify Payments"
  };
}

async function regenerateExistingInvoiceFromShopify(env, existingInvoice) {
  if (!existingInvoice?.shopify_order_id) {
    throw new Error("Existing invoice is missing shopify_order_id");
  }

  const order = await fetchShopifyOrderById(
    env,
    existingInvoice.shopify_order_id
  );

  const invoiceData = buildInvoiceDataFromShopifyOrder(
    order,
    existingInvoice
  );

  const invoiceHtml = renderInvoiceHtml(invoiceData);

  const htmlFileName =
    `invoices/${existingInvoice.invoice_number}.html`;

  await env.INVOICES.put(
    htmlFileName,
    invoiceHtml,
    {
      httpMetadata: {
        contentType: "text/html; charset=utf-8",
        contentDisposition:
          `inline; filename="${existingInvoice.invoice_number}.html"`
      }
    }
  );

  const pdfResult = await uploadInvoicePdf(env, {
    invoiceNumber: existingInvoice.invoice_number,
    invoiceHtml
  });

  await env.DB.prepare(`
    UPDATE invoice_registry
    SET pdf_key = ?,
        pdf_url = ?,
        status = ?,
        invoice_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_number = ?
  `)
    .bind(
      pdfResult.pdfKey,
      pdfResult.pdfKey,
      "issued",
      existingInvoice.invoice_number
    )
    .run();

  return {
    order_number: invoiceData.orderNumber,
    invoice_number: existingInvoice.invoice_number,
    status: "regenerated",
    file_url: pdfResult.pdfKey,
    html_file_url: htmlFileName
  };
}

export async function handleRegenerateFiles(request, env) {
  try {
    const body = await request.json();

    if (!body.csv && (body.invoice_number || body.order_number)) {
      const existingInvoice = body.invoice_number
        ? await getInvoiceByInvoiceNumber(env, String(body.invoice_number).trim())
        : await getInvoiceByOrderNumber(env, Number(body.order_number));

      if (!existingInvoice) {
        return json({
          error: "Invoice registry record not found"
        }, 404);
      }

      const result = await regenerateExistingInvoiceFromShopify(
        env,
        existingInvoice
      );

      return json({
        success: true,
        processed_count: 1,
        results: [result]
      });
    }

    if (!body.csv) {
      return json({
        error: "Missing csv field"
      }, 400);
    }

    const limit = body.limit
      ? Number(body.limit)
      : null;

    const onlyOrderNumber = body.order_number
      ? Number(body.order_number)
      : null;

    const forceRegenerate =
      body.force === true ||
      body.force_regenerate === true;

    const orders = parseMigrationCsv(
      body.csv,
      {
        invoicePrefix: env.INVOICE_PREFIX,
        startingInvoiceSequence: 10001
      }
    );

    const filteredOrders = orders.filter(order => {
      if (onlyOrderNumber) {
        return order.orderNumber === onlyOrderNumber;
      }

      return true;
    });

    const results = [];
    const pendingOrders = [];

    for (const order of filteredOrders) {
      const existingInvoice = await getInvoiceByOrderNumber(
        env,
        order.orderNumber
      );

      if (!existingInvoice) {
        results.push({
          order_number: order.orderNumber,
          status: "missing_invoice_registry_record"
        });

        continue;
      }

      if (
        !forceRegenerate &&
        (existingInvoice.pdf_key || existingInvoice.pdf_url) &&
        (existingInvoice.pdf_key || existingInvoice.pdf_url).endsWith(".pdf")
      ) {
        results.push({
          order_number: order.orderNumber,
          invoice_number: existingInvoice.invoice_number,
          status: "skipped_existing_pdf",
          file_url: existingInvoice.pdf_key || existingInvoice.pdf_url
        });

        continue;
      }

      pendingOrders.push({
        order,
        existingInvoice
      });
    }

    const targetOrders = limit
      ? pendingOrders.slice(0, limit)
      : pendingOrders;

    for (const target of targetOrders) {
      const order = target.order;
      const existingInvoice = target.existingInvoice;

      const invoiceData = buildInvoiceData(
        order,
        existingInvoice
      );

      const invoiceHtml = renderInvoiceHtml(invoiceData);

      const htmlFileName =
        `invoices/${existingInvoice.invoice_number}.html`;

      await env.INVOICES.put(
        htmlFileName,
        invoiceHtml,
        {
          httpMetadata: {
            contentType: "text/html; charset=utf-8",
            contentDisposition:
              `inline; filename="${existingInvoice.invoice_number}.html"`
          }
        }
      );

      const pdfResult = await uploadInvoicePdf(env, {
        invoiceNumber: existingInvoice.invoice_number,
        invoiceHtml
      });

      await env.DB.prepare(`
        UPDATE invoice_registry
        SET pdf_key = ?,
            pdf_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE invoice_number = ?
      `)
        .bind(
          pdfResult.pdfKey,
          pdfResult.pdfKey,
          existingInvoice.invoice_number
        )
        .run();

      results.push({
        order_number: order.orderNumber,
        invoice_number: existingInvoice.invoice_number,
        status: "regenerated",
        file_url: pdfResult.pdfKey,
        html_file_url: htmlFileName
      });
      if (targetOrders.length > 1 && target !== targetOrders[targetOrders.length - 1]) {
        await delay(45000);
      }
    }

    return json({
      success: true,
      processed_count: results.length,
      results
    });

  } catch (error) {
    return json({
      error: "Regenerate files failed",
      message: error.message
    }, 500);
  }
}
