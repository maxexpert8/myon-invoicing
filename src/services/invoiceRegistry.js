export async function getInvoiceByOrderNumber(env, orderNumber) {
  return await env.DB.prepare(`
    SELECT *
    FROM invoice_registry
    WHERE shopify_order_number = ?
    LIMIT 1
  `)
    .bind(orderNumber)
    .first();
}

export function generateDownloadToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInvoiceRegistryRecord(
  env,
  {
    shopifyOrderId,
    orderNumber,
    invoiceSequence,
    invoiceNumber,
    fileUrl,
    source,
    issuedAt,
    customerName = null,
    customerEmail = null,
    totalAmount = null,
    downloadToken = generateDownloadToken()
  }
) {
  return await env.DB.prepare(`
    INSERT INTO invoice_registry (
      shopify_order_id,
      shopify_order_number,
      invoice_sequence,
      invoice_number,
      pdf_url,
      status,
      source,
      issued_at,
      customer_name,
      customer_email,
      total_amount,
      download_token
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      shopifyOrderId,
      orderNumber,
      invoiceSequence,
      invoiceNumber,
      fileUrl,
      "issued",
      source,
      issuedAt,
      customerName,
      customerEmail,
      totalAmount,
      downloadToken
    )
    .run();
}

export async function allocateInvoiceSequence(env) {
  const row = await env.DB.prepare(`
    UPDATE invoice_counter
    SET next_number = next_number + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
    RETURNING next_number - 1 AS invoice_sequence
  `)
    .bind("MYONS_MAIN")
    .first();

  if (!row) {
    throw new Error("Missing invoice_counter row for MYONS_MAIN");
  }

  return Number(row.invoice_sequence);
}
