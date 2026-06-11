import { json } from "../../utils/response.js";
import { isAuthorizedAdminRequest } from "../../utils/adminAuth.js";
import { withTimeout } from "../../utils/asyncGuards.js";

async function fetchRecentPaidOrders(env) {
  const response = await withTimeout(
    fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_TOKEN
      },
      body: JSON.stringify({
        query: `
          {
            orders(first: 25, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
              nodes {
                id
                name
                createdAt
                displayFinancialStatus
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        `
      })
    }
  ), 15000, "Shopify API request");

  const data = await response.json();

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data.data.orders.nodes;
}

export async function handleAdminReconcile(request, env) {
  if (!(await isAuthorizedAdminRequest(request, env, { allowManualSecret: true }))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const orders = await fetchRecentPaidOrders(env);

  const results = [];

  for (const order of orders) {
    const orderNumber = Number(order.name.replace("#", ""));

    const invoice = await env.DB.prepare(`
      SELECT invoice_number, pdf_key, pdf_url
      FROM invoice_registry
      WHERE shopify_order_number = ?
      LIMIT 1
    `)
      .bind(orderNumber)
      .first();

    results.push({
      order_number: orderNumber,
      shopify_order_id: order.id,
      created_at: order.createdAt,
      financial_status: order.displayFinancialStatus,
      total_amount: order.totalPriceSet.shopMoney.amount,
      invoice_exists: Boolean(invoice),
      invoice_number: invoice?.invoice_number || null,
      pdf_key: invoice?.pdf_key || invoice?.pdf_url || null,
      status: invoice ? "ok" : "missing_invoice"
    });
  }

  return json({
    success: true,
    missing_count: results.filter(r => r.status === "missing_invoice").length,
    results
  });
}
