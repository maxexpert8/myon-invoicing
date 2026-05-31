import { json } from "../../utils/response.js";

import {
  parseMigrationCsv
} from "../../services/csvMigration.js";

import {
  getInvoiceByOrderNumber
} from "../../services/invoiceRegistry.js";

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

export async function handleRegenerateFiles(request, env) {
  try {
    const body = await request.json();

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
        existingInvoice.pdf_url &&
        existingInvoice.pdf_url.endsWith(".pdf")
      ) {
        results.push({
          order_number: order.orderNumber,
          invoice_number: existingInvoice.invoice_number,
          status: "skipped_existing_pdf",
          file_url: existingInvoice.pdf_url
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

      const htmlFileUrl =
        `${env.PUBLIC_BUCKET_URL}/${htmlFileName}`;

      const pdfResult = await uploadInvoicePdf(env, {
        invoiceNumber: existingInvoice.invoice_number,
        invoiceHtml
      });

      await env.DB.prepare(`
        UPDATE invoice_registry
        SET pdf_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE invoice_number = ?
      `)
        .bind(
          pdfResult.fileUrl,
          existingInvoice.invoice_number
        )
        .run();

      results.push({
        order_number: order.orderNumber,
        invoice_number: existingInvoice.invoice_number,
        status: "regenerated",
        file_url: pdfResult.fileUrl,
        html_file_url: htmlFileUrl
      });
      if (targetOrders.length > 1 && target !== targetOrders[targetOrders.length - 1]) {
        await delay(45000);wra
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