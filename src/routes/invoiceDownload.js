export async function handleInvoiceDownload(
  request,
  env
) {
  const url = new URL(request.url);

  const orderNumber = Number(
    url.searchParams.get("order_number")
  );

  if (!orderNumber) {
    return new Response(
      "Missing order_number",
      { status: 400 }
    );
  }

  const invoice = await env.DB.prepare(`
    SELECT pdf_url
    FROM invoice_registry
    WHERE shopify_order_number = ?
    LIMIT 1
  `)
    .bind(orderNumber)
    .first();

  if (!invoice) {
    return new Response(
      "Invoice not found",
      { status: 404 }
    );
  }

  return Response.redirect(
    invoice.pdf_url,
    302
  );
}