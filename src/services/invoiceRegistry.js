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
    totalAmount = null
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
      total_amount
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      totalAmount
    )
    .run();
}

export async function getNextInvoiceSequence(env) {
  const row = await env.DB.prepare(`
    SELECT next_number
    FROM invoice_counter
    WHERE key = ?
    LIMIT 1
  `)
    .bind("MYONS_MAIN")
    .first();

  if (!row) {
    throw new Error("Missing invoice_counter row for MYONS_MAIN");
  }

  return Number(row.next_number);
}

export async function incrementInvoiceCounter(env) {
  return await env.DB.prepare(`
    UPDATE invoice_counter
    SET next_number = next_number + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `)
    .bind("MYONS_MAIN")
    .run();
}