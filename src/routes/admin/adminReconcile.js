import { json } from "../../utils/response.js";

async function verifyShopifyAdmin(request, env) {
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");

  if (request.headers.get("x-manual-secret") === env.MANUAL_SECRET) {
    return true;
  }

  if (!hmac || !env.SHOPIFY_WEBHOOK_SECRET) return false;

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

  return computed === hmac;
}

async function fetchRecentPaidOrders(env) {
  const response = await fetch(
    `https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
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
  );

  const data = await response.json();

  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data.data.orders.nodes;
}

export async function handleAdminReconcile(request, env) {
  if (!(await verifyShopifyAdmin(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const orders = await fetchRecentPaidOrders(env);

  const results = [];

  for (const order of orders) {
    const orderNumber = Number(order.name.replace("#", ""));

    const invoice = await env.DB.prepare(`
      SELECT invoice_number, pdf_url
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
      pdf_url: invoice?.pdf_url || null,
      status: invoice ? "ok" : "missing_invoice"
    });
  }

  return json({
    success: true,
    missing_count: results.filter(r => r.status === "missing_invoice").length,
    results
  });
}