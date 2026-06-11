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
    pdfKey,
    fileUrl = pdfKey,
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
      pdf_key,
      status,
      source,
      issued_at,
      customer_name,
      customer_email,
      total_amount,
      download_token
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      shopifyOrderId,
      orderNumber,
      invoiceSequence,
      invoiceNumber,
      fileUrl,
      pdfKey || fileUrl,
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

export async function createPendingInvoiceRegistryRecord(
  env,
  {
    shopifyOrderId,
    orderNumber,
    invoiceSequence,
    invoiceNumber,
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
      pdf_key,
      status,
      source,
      issued_at,
      customer_name,
      customer_email,
      total_amount,
      download_token,
      invoice_error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      shopifyOrderId,
      orderNumber,
      invoiceSequence,
      invoiceNumber,
      "",
      "",
      "pending",
      source,
      issuedAt,
      customerName,
      customerEmail,
      totalAmount,
      downloadToken,
      null
    )
    .run();
}

export async function markInvoicePending(env, invoiceNumber) {
  return await env.DB.prepare(`
    UPDATE invoice_registry
    SET status = ?,
        invoice_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_number = ?
  `)
    .bind("pending", invoiceNumber)
    .run();
}

export async function markInvoiceIssued(
  env,
  {
    invoiceNumber,
    pdfKey
  }
) {
  return await env.DB.prepare(`
    UPDATE invoice_registry
    SET pdf_url = ?,
        pdf_key = ?,
        status = ?,
        invoice_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_number = ?
  `)
    .bind(
      pdfKey,
      pdfKey,
      "issued",
      invoiceNumber
    )
    .run();
}

export async function markInvoiceFailed(
  env,
  {
    invoiceNumber,
    errorMessage
  }
) {
  return await env.DB.prepare(`
    UPDATE invoice_registry
    SET status = ?,
        invoice_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_number = ?
  `)
    .bind(
      "failed",
      String(errorMessage || "Unknown invoice generation error").slice(0, 1000),
      invoiceNumber
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
