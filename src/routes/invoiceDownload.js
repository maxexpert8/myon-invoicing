function getInvoiceKey(invoice) {
  if (invoice.pdf_key) {
    return invoice.pdf_key;
  }

  const pdfUrl = String(invoice.pdf_url || "");
  const match = pdfUrl.match(/\/(invoices\/[^/?#]+\.pdf)(?:[?#].*)?$/);

  return match ? match[1] : "";
}

export async function handleInvoiceDownload(
  request,
  env
) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();

  if (!token) {
    return new Response(
      "Missing token",
      { status: 400 }
    );
  }

  const invoice = await env.DB.prepare(`
    SELECT invoice_number, pdf_url, download_token
    FROM invoice_registry
    WHERE download_token = ?
    LIMIT 1
  `)
    .bind(token)
    .first();

  if (!invoice) {
    return new Response(
      "Invoice not found",
      { status: 404 }
    );
  }

  const pdfKey = getInvoiceKey(invoice);

  if (!pdfKey) {
    return new Response(
      "Invoice file not found",
      { status: 404 }
    );
  }

  const pdfObject = await env.INVOICES.get(pdfKey);

  if (!pdfObject) {
    return new Response(
      "Invoice file not found",
      { status: 404 }
    );
  }

  return new Response(
    pdfObject.body,
    {
      headers: {
        "content-type": "application/pdf",
        "content-disposition":
          `inline; filename="${invoice.invoice_number}.pdf"`,
        "cache-control": "private, max-age=300"
      }
    }
  );
}
