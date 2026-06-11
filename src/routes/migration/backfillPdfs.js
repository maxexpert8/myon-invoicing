import { json } from "../../utils/response.js";
import { uploadInvoicePdf } from "../../services/pdfRenderer.js";

export async function handleBackfillPdfs(request, env) {
  try {
    const body = await request.json().catch(() => ({}));

    const limit = Number(body.limit || 2);

    const rows = await env.DB.prepare(`
      SELECT invoice_number, pdf_key, pdf_url
      FROM invoice_registry
      WHERE COALESCE(pdf_key, pdf_url) LIKE '%.html'
      ORDER BY invoice_sequence ASC
      LIMIT ?
    `)
      .bind(limit)
      .all();

    const invoices = rows.results || [];
    const results = [];

    for (const invoice of invoices) {
      try {
        const htmlKey = `invoices/${invoice.invoice_number}.html`;

        const htmlObject = await env.INVOICES.get(htmlKey);

        if (!htmlObject) {
          results.push({
            invoice_number: invoice.invoice_number,
            status: "missing_html"
          });
          continue;
        }

        const invoiceHtml = await htmlObject.text();

        const pdfResult = await uploadInvoicePdf(env, {
          invoiceNumber: invoice.invoice_number,
          invoiceHtml
        });

        await env.DB.prepare(`
          UPDATE invoice_registry
          SET pdf_key = ?,
              pdf_url = ?,
              invoice_error = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE invoice_number = ?
        `)
          .bind(
            pdfResult.pdfKey,
            pdfResult.pdfKey,
            invoice.invoice_number
          )
          .run();

        results.push({
          invoice_number: invoice.invoice_number,
          status: "pdf_created",
          pdf_key: pdfResult.pdfKey
        });
      } catch (error) {
        console.error("PDF backfill invoice failed", {
          invoiceNumber: invoice.invoice_number,
          message: error?.message,
          name: error?.name,
          stack: error?.stack
        });

        await env.DB.prepare(`
          UPDATE invoice_registry
          SET status = ?,
              invoice_error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE invoice_number = ?
        `)
          .bind(
            "failed",
            error?.message || "PDF backfill failed",
            invoice.invoice_number
          )
          .run()
          .catch(dbError => {
            console.error("Failed to record PDF backfill error", {
              invoiceNumber: invoice.invoice_number,
              message: dbError?.message,
              name: dbError?.name
            });
          });

        results.push({
          invoice_number: invoice.invoice_number,
          status: "failed",
          message: error?.message || "PDF backfill failed"
        });
      }
    }

    return json({
      success: true,
      processed_count: results.length,
      results
    });

  } catch (error) {
    return json({
      error: "PDF backfill failed",
      message: error.message
    }, 500);
  }
}
