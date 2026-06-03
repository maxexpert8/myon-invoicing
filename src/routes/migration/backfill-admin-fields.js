import { json } from "../../utils/response.js";
import { parseMigrationCsv } from "../../services/csvMigration.js";

export async function handleBackfillAdminFields(request, env) {
  try {
    const body = await request.json();

    if (!body.csv) {
      return json({ error: "Missing csv field" }, 400);
    }

    const orders = parseMigrationCsv(body.csv, {
      invoicePrefix: env.INVOICE_PREFIX,
      startingInvoiceSequence: 10001
    });

    const results = [];

    for (const order of orders) {
      await env.DB.prepare(`
        UPDATE invoice_registry
        SET customer_name = ?,
            customer_email = ?,
            total_amount = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE shopify_order_number = ?
      `)
        .bind(
          order.customerName || order.billingName || null,
          order.customerEmail || order.email || null,
          order.totalGross || order.total || null,
          order.orderNumber
        )
        .run();

      results.push({
        order_number: order.orderNumber,
        customer_name: order.customerName || order.billingName,
        total_amount: order.totalGross || order.total,
        status: "updated"
      });
    }

    return json({
      success: true,
      updated_count: results.length,
      results
    });

  } catch (error) {
    return json({
      error: "Backfill admin fields failed",
      message: error.message
    }, 500);
  }
}