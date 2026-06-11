import { json } from "../utils/response.js";

import {
  getInvoiceByOrderNumber,
  createInvoiceRegistryRecord,
  allocateInvoiceSequence
} from "../services/invoiceRegistry.js";

import { renderInvoiceHtml }
  from "../services/invoiceRenderer.js";

export async function handleManualInvoice(
  request,
  env
) {
  try {
    const body = await request.json();

    const orderNumber = Number(body.order_number);

    if (!orderNumber) {
      return json({
        error: "Missing order_number"
      }, 400);
    }

    const existing =
      await getInvoiceByOrderNumber(
        env,
        orderNumber
      );

    if (existing) {
      return json({
        message: "Invoice already exists",
        invoice_number: existing.invoice_number,
        file_url: existing.pdf_key || existing.pdf_url,
        existing: true
      });
    }

    const invoiceSequence = body.invoice_sequence
      ? Number(body.invoice_sequence)
      : await allocateInvoiceSequence(env);

    if (!invoiceSequence) {
      return json({
        error: "Invalid invoice_sequence"
      }, 400);
    }

    const invoiceNumber =
      `${env.INVOICE_PREFIX}${invoiceSequence}`;

    const issuedAt =
      body.issued_at ||
      new Date().toISOString();

    const invoiceHtml =
      renderInvoiceHtml({
        orderNumber,
        invoiceNumber,
        issuedAt,

        customerName:
          body.customer_name || "Test Customer",

        customerEmail:
          body.customer_email || "",

        billingAddress:
          body.billing_address || "",

        billingName:
          body.billingName || "",

        billingCompany:
          body.billingCompany || "",

        billingAddress1:
          body.billingAddress1 || "",

        billingAddress2:
          body.billingAddress2 || "",

        billingCity:
          body.billingCity || "",

        billingZip:
          body.billingZip || "",

        billingCountry:
          body.billingCountry || "",

        billingCountryName:
          body.billingCountryName || "",

        customerFullName:
          body.customerFullName || "",

        primaryTaxTitle:
          body.primaryTaxTitle || "",

        paymentMethod:
          body.payment_method ||
          "Shopify Payments",

        items:
          Array.isArray(body.items)
            ? body.items
            : [],

        vatSummary:
          Array.isArray(body.vatSummary)
            ? body.vatSummary
            : [],

        totalGross:
          body.totalGross ||
          body.total_gross ||
          "0.00",

        totalNet:
          body.totalNet ||
          body.total_net ||
          "0.00",

        vatAmount:
          body.vatAmount ||
          body.vat_amount ||
          "0.00",

        vatRate:
          body.vatRate ||
          body.vat_rate ||
          "19%",

        outstandingAmount:
          body.outstandingAmount ||
          body.outstanding_amount ||
          "0.00"
      });

    const fileName =
      `invoices/${invoiceNumber}.html`;

    await env.INVOICES.put(
      fileName,
      invoiceHtml,
      {
        httpMetadata: {
          contentType:
            "text/html; charset=utf-8"
        }
      }
    );

    await createInvoiceRegistryRecord(
      env,
      {
        shopifyOrderId:
          body.shopify_order_id ||
          `manual-${orderNumber}`,

        orderNumber,

        invoiceSequence,

        invoiceNumber,

        pdfKey: fileName,

        source: "manual",

        issuedAt,

        customerName:
          body.customer_name ||
          body.customerFullName ||
          body.billingName ||
          null,

        customerEmail:
          body.customer_email ||
          null,

        totalAmount:
          body.totalGross ||
          body.total_gross ||
          null
      }
    );

    return json({
      success: true,
      order_number: orderNumber,
      invoice_sequence: invoiceSequence,
      invoice_number: invoiceNumber,
      file_url: fileName
    });

  } catch (error) {
    return json({
      error: "Worker failed",
      message: error.message
    }, 500);
  }
}
