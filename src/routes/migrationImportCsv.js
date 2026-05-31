import { json } from "../utils/response.js";

import {
  parseMigrationCsv
} from "../services/csvMigration.js";

import {
  getInvoiceByOrderNumber,
  createInvoiceRegistryRecord
} from "../services/invoiceRegistry.js";

import { renderInvoiceHtml } from "../services/invoiceRenderer.js";

import { uploadInvoicePdf } from "../services/pdfRenderer.js";

export async function handleMigrationImportCsv(
  request,
  env
) {
  try {

    const body =
      await request.json();

    if (!body.csv) {
      return json({
        error:
          "Missing csv field"
      }, 400);
    }

    const orders =
      parseMigrationCsv(
        body.csv,
        {
          invoicePrefix: env.INVOICE_PREFIX,
          startingInvoiceSequence:
            Number(body.starting_invoice_sequence || 10001)
        }
      );

    const results = [];

    for (const order of orders) {

      const existing =
        await getInvoiceByOrderNumber(
          env,
          order.orderNumber
        );

      if (existing) {

        results.push({
          order_number:
            order.orderNumber,

          status:
            "skipped_existing",

          invoice_number:
            existing.invoice_number,

          file_url:
            existing.pdf_url
        });

        continue;
      }

      const billingAddress = [
        order.billingAddress1,
        order.billingAddress2,
        `${order.billingZip} ${order.billingCity}`.trim(),
        order.billingCountryName || order.billingCountry
      ]
      .filter(Boolean)
      .join(", ");

      const invoiceHtml =
        renderInvoiceHtml({

          orderNumber:
            order.orderNumber,

          invoiceNumber:
            order.invoiceNumber,

          issuedAt:
            order.issuedAt,

          customerName:
            order.customerName,

          customerFullName:
            order.customerFullName,

          customerEmail:
            order.customerEmail,

          billingAddress,

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
        });

      const htmlFileName = `invoices/${order.invoiceNumber}.html`;

      await env.INVOICES.put(htmlFileName, invoiceHtml, {
        httpMetadata: {
          contentType: "text/html; charset=utf-8",
          contentDisposition:
            `inline; filename="${order.invoiceNumber}.html"`
        }
      });

      const htmlFileUrl = `${env.PUBLIC_BUCKET_URL}/${htmlFileName}`;

      const pdfResult = await uploadInvoicePdf(env, {
        invoiceNumber: order.invoiceNumber,
        invoiceHtml
      });

      const fileUrl = pdfResult.fileUrl;
      
      await createInvoiceRegistryRecord(
        env,
        {
          shopifyOrderId:
            order.shopifyOrderId,

          orderNumber:
            order.orderNumber,

          invoiceSequence:
            order.invoiceSequence,

          invoiceNumber:
            order.invoiceNumber,

          fileUrl,

          source:
            "migration_csv",

          issuedAt:
            order.issuedAt
        }
      );

      results.push({
        order_number:
          order.orderNumber,

        invoice_sequence:
          order.invoiceSequence,

        invoice_number:
          order.invoiceNumber,

        status:
          "created",

        file_url:
          fileUrl,

        html_file_url: 
          htmlFileUrl
      });
    }

    return json({
      success: true,

      imported_count:
        results.filter(
          r => r.status === "created"
        ).length,

      skipped_existing_count:
        results.filter(
          r =>
            r.status ===
            "skipped_existing"
        ).length,

      skipped_test_orders:
        [1053, 1054, 1055],

      results
    });

  } catch (error) {

    return json({
      error:
        "Migration import failed",

      message:
        error.message
    }, 500);
  }
}