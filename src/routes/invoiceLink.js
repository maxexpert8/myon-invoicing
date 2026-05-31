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

  const orderNumber = Number(
    url.searchParams.get("order_number")
  );

  const orderIdInput =
    url.searchParams.get("order_id");

  const orderId = normalizeOrderId(orderIdInput);

  if (!orderNumber && !orderId.raw) {
    return json({
      error: "Missing order_number or order_id"
    }, 400);
  }

  let invoice;

  if (orderNumber) {
    invoice = await env.DB.prepare(`
      SELECT invoice_number, pdf_url, status
      FROM invoice_registry
      WHERE shopify_order_number = ?
      LIMIT 1
    `)
      .bind(orderNumber)
      .first();
  }

  if (!invoice && orderId.raw) {
    invoice = await env.DB.prepare(`
      SELECT invoice_number, pdf_url, status
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
  }

  if (!invoice) {
    return json({
      ready: false,
      message: "Invoice is still being prepared"
    }, 404);
  }

  return json({
    ready: true,
    invoice_number: invoice.invoice_number,
    url: invoice.pdf_url,
    status: invoice.status
  });
}