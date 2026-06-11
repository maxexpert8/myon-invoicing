import { json } from "../utils/response.js";

function normalizeOrderId(orderId) {
  const raw = String(orderId || "").trim();

  if (!raw) {
    return {
      raw: "",
      numeric: ""
    };
  }

  const numericMatch = raw.match(/(\d+)$/);

  return {
    raw,
    numeric: numericMatch ? numericMatch[1] : ""
  };
}

export async function handleInvoiceLink(request, env) {
  const url = new URL(request.url);

  const orderIdInput =
    url.searchParams.get("order_id");

  const orderId = normalizeOrderId(orderIdInput);

  if (!orderId.raw) {
    return json({
      error: "Missing order_id"
    }, 400);
  }

  const invoice = await env.DB.prepare(`
    SELECT invoice_number, download_token, status
    FROM invoice_registry
    WHERE shopify_order_id = ?
       OR shopify_order_id = ?
    LIMIT 1
  `)
    .bind(
      orderId.raw,
      orderId.numeric || orderId.raw
    )
    .first();

  if (!invoice) {
    return json({
      ready: false,
      message: "Invoice is still being prepared"
    }, 404);
  }

  return json({
    ready: true,
    invoice_number: invoice.invoice_number,
    url: `${url.origin}/invoice-download?token=${encodeURIComponent(invoice.download_token)}`,
    status: invoice.status
  });
}
