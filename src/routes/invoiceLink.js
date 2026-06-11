import { json } from "../utils/response.js";

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store"
    }
  });
}

function wantsJson(request, url) {
  return url.searchParams.get("format") === "json" ||
    String(request.headers.get("accept") || "").includes("application/json");
}

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

  const returnJson = wantsJson(request, url);

  if (!orderId.raw) {
    if (returnJson) {
      return json({
        error: "Missing order_id"
      }, 400);
    }

    return htmlResponse(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Rechnung nicht gefunden</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 32px; color: #1b2330;">
  <h1>Rechnung nicht gefunden</h1>
  <p>Der Rechnungslink ist ungültig oder unvollständig.</p>
</body>
</html>`, 400);
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

  if (!invoice || !invoice.download_token || invoice.status !== "issued") {
    if (returnJson) {
      return json({
        ready: false,
        message: "Invoice is still being prepared"
      }, 404);
    }

    return htmlResponse(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Rechnung wird vorbereitet</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 32px; color: #1b2330;">
  <h1>Ihre Rechnung wird vorbereitet</h1>
  <p>Ihre Rechnung ist noch nicht verfügbar. Bitte versuchen Sie es in wenigen Minuten erneut.</p>
</body>
</html>`, 404);
  }

  const downloadUrl = `${url.origin}/invoice-download?token=${encodeURIComponent(invoice.download_token)}`;

  if (returnJson) {
    return json({
      ready: true,
      invoice_number: invoice.invoice_number,
      url: downloadUrl,
      status: invoice.status
    });
  }

  return Response.redirect(downloadUrl, 302);
}
