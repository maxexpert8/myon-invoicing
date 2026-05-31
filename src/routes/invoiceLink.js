import { json } from "../utils/response.js";

export async function handleInvoiceLink(request, env) {
  const url = new URL(request.url);

  const orderNumber = Number(
    url.searchParams.get("order_number")
  );

  if (!orderNumber) {
    return json({
      error: "Missing order_number"
    }, 400);
  }

  const invoice = await env.DB.prepare(`
    SELECT invoice_number, pdf_url, status
    FROM invoice_registry
    WHERE shopify_order_number = ?
    LIMIT 1
  `)
    .bind(orderNumber)
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
    url: invoice.pdf_url,
    status: invoice.status
  });
}