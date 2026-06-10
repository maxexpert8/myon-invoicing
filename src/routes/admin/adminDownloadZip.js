import { zipSync } from "fflate";

async function isAuthorized(request, env) {
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");

  if (!hmac || !env.SHOPIFY_WEBHOOK_SECRET) {
    return false;
  }

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

  return timingSafeEqual(computed, hmac);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

export async function handleAdminDownloadZip(request, env) {
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  const invoiceNumbers = Array.isArray(body.invoice_numbers)
    ? body.invoice_numbers
    : [];

  if (invoiceNumbers.length === 0) {
    return new Response("No invoices selected", { status: 400 });
  }

  if (invoiceNumbers.length > 50) {
    return new Response("Maximum 50 invoices per ZIP", { status: 400 });
  }

  const zipFiles = {};

  for (const invoiceNumber of invoiceNumbers) {
    const safeInvoiceNumber = String(invoiceNumber).trim();

    if (!safeInvoiceNumber.startsWith("INV-MYONS-")) {
      continue;
    }

    const pdfKey = `invoices/${safeInvoiceNumber}.pdf`;
    const pdfObject = await env.INVOICES.get(pdfKey);

    if (!pdfObject) {
      continue;
    }

    const pdfBuffer = await pdfObject.arrayBuffer();

    zipFiles[`${safeInvoiceNumber}.pdf`] =
      new Uint8Array(pdfBuffer);
  }

  const zipBuffer = zipSync(zipFiles, {
    level: 0
  });

  return new Response(zipBuffer, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="myon-invoices.zip"`
    }
  });
}