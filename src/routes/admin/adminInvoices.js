import { json } from "../../utils/response.js";

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

function renderAdminPage() {
  const nonce = crypto.getRandomValues(new Uint8Array(16)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>myon.clinic invoices</title>
  <style nonce="${nonce}">
    body { font-family: Arial, sans-serif; padding: 24px; color: #1b2330; }
    h1 { margin-bottom: 16px; }
    img.logo { max-width: 50px; }
    h1:has(.logo) { display: flex; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #1b2330; color: white; }
    a.button {
      display: inline-block;
      padding: 6px 10px;
      margin-right: 6px;
      background: #ec9447;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
    }
    .amount { text-align: right; white-space: nowrap; }
    .muted { color: #667085; font-size: 12px; }
    #stats { 
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:12px;
      margin-bottom:20px;
    }
    #stats > div {
      padding:14px;
      border:1px solid #ddd;
      border-radius:8px;
    }
    .downloadZipWrapper {
      margin-bottom:16px
    }
    .downloadZipWrapper button {
      padding:8px 12px;
      background:#1b2330;
      color:white;
      border:0;
      border-radius:4px;
      cursor:pointer;
    }
    #reconcileResult{
      margin-bottom:16px;
    } 
  </style>
</head>
<body>
  <h1><img src="https://cdn.shopify.com/s/files/applications/7f16e51dffdb83fdee43dd83bd080490_200x200.png?v=1780244691" alt="myon.clinic invoices logo" class="logo">myon.clinic invoices</h1>
  <div id="stats"></div>
  <div class="downloadZipWrapper">
    <button id="checkMissing">Check Missing Invoices</button>
    <button id="createMissing">Create Missing Invoices</button>
    <button id="downloadZip">Download selected as ZIP</button>
  </div>
  <div id="reconcileResult"></div>
  <table>
    <thead>
      <tr>
        <th><input type="checkbox" id="selectAll"></th>
        <th>Order #</th>
        <th>Customer</th>
        <th class="amount">Amount</th>
        <th>Invoice #</th>
        <th>Issued at</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="rows">
      <tr><td colspan="8">Loading...</td></tr>
    </tbody>
  </table>

  <script nonce="${nonce}">
    async function loadInvoices() {
      const res = await fetch('/admin/invoices' + window.location.search);
      const data = await res.json();

      const rows = document.getElementById('rows');

      if (!data.invoices || data.invoices.length === 0) {
        rows.innerHTML = '<tr><td colspan="8">No invoices found</td></tr>';
        return;
      }

      rows.innerHTML = data.invoices.map(inv => \`
        <tr>
          <td><input type="checkbox" class="invoice-check" value="\${inv.invoice_number}"></td>
          <td>#\${inv.shopify_order_number}</td>
          <td>
            <div>\${inv.customer_name || '—'}</div>
            <div class="muted">\${inv.customer_email || ''}</div>
          </td>
          <td class="amount">€\${Number(inv.total_amount || 0).toFixed(2)}</td>
          <td>\${inv.invoice_number}</td>
          <td>\${inv.issued_at || ''}</td>
          <td>\${inv.status || ''}</td>
          <td>
            <a class="button" href="\${inv.pdf_url}" target="_blank">Download</a>
            <a class="button" href="\${inv.pdf_url}" target="_blank">Print</a>
          </td>
        </tr>
      \`).join('');

      const stats = document.getElementById('stats');

      stats.innerHTML = \`
      <div>
          <div class="muted">Total invoices</div>
          <strong>\${data.stats.total_invoices}</strong>
      </div>
      <div>
          <div class="muted">Revenue</div>
          <strong>€\${data.stats.total_revenue}</strong>
      </div>
      <div>
          <div class="muted">Last order</div>
          <strong>#\${data.stats.last_order_number}</strong>
      </div>
      <div>
          <div class="muted">Last invoice</div>
          <strong>\${data.stats.last_invoice_number}</strong>
      </div>
      \`;
    }

    loadInvoices();

    document.addEventListener("click", async (event) => {
      if (event.target.id !== "downloadZip" && event.target.id !== "checkMissing" && event.target.id !== "createMissing") return;
      if (event.target.id === "createMissing") {
        const box = document.getElementById("reconcileResult");

        box.innerHTML = '<div style="padding:12px;border:1px solid #ddd;border-radius:8px;">Creating missing invoices...</div>';

        const res = await fetch("/admin/create-missing-invoices" + window.location.search, {
          method: "POST"
        });

        const data = await res.json();

        if (!data.success) {
          box.innerHTML = '<div style="padding:12px;border:1px solid #f3b5b5;background:#fff5f5;border-radius:8px;">Create missing invoices failed.</div>';
          return;
        }

        box.innerHTML =
          '<div style="padding:12px;border:1px solid #b7e4c7;background:#f0fff4;border-radius:8px;">' +
          'Created ' + data.created_count + ' missing invoice(s).' +
          '</div>';

        loadInvoices();
      }
      if (event.target.id === "checkMissing") {
        const box = document.getElementById("reconcileResult");

        box.innerHTML = '<div style="padding:12px;border:1px solid #ddd;border-radius:8px;">Checking Shopify paid orders...</div>';

        const res = await fetch("/admin/reconcile" + window.location.search);
        const data = await res.json();

        if (!data.success) {
          box.innerHTML = '<div style="padding:12px;border:1px solid #f3b5b5;background:#fff5f5;border-radius:8px;">Reconciliation failed.</div>';
          return;
        }

        const missing = data.results.filter(item => item.status === "missing_invoice");

        if (missing.length === 0) {
          box.innerHTML = '<div style="padding:12px;border:1px solid #b7e4c7;background:#f0fff4;border-radius:8px;">All recent paid Shopify orders have invoices.</div>';
          return;
        }

        const missingItems = missing.map(order =>
          '<li>Order #' + order.order_number + ' — €' + order.total_amount + ' — ' + order.created_at + '</li>'
        ).join("");

        box.innerHTML =
          '<div style="padding:12px;border:1px solid #f6c177;background:#fff7ed;border-radius:8px;">' +
            '<strong>' + missing.length + ' missing invoice(s) found:</strong>' +
            '<ul>' + missingItems + '</ul>' +
          '</div>';

      }
      else if (event.target.id === "downloadZip") {
        const selected = Array.from(
          document.querySelectorAll(".invoice-check:checked")
        ).map(input => input.value);

        if (selected.length === 0) {
          alert("Please select at least one invoice.");
          return;
        }

        const res = await fetch("/admin/download-zip" + window.location.search, {
          method: "POST",
          headers: {
          "content-type": "application/json"
          },
          body: JSON.stringify({
          invoice_numbers: selected
          })
        });

        if (!res.ok) {
          alert("ZIP download failed.");
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "myon-invoices.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.id !== "selectAll") return;
      document.querySelectorAll(".invoice-check").forEach(input => {input.checked = event.target.checked;});
    });
  </script>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
}

export async function handleAdminPage(request, env) {
  if (!(await isAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  return renderAdminPage();
}

export async function handleAdminInvoices(request, env) {
  if (!(await isAuthorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const rows = await env.DB.prepare(`
    SELECT
      shopify_order_number,
      invoice_number,
      pdf_url,
      status,
      issued_at,
      created_at,
      customer_name,
      customer_email,
      total_amount
    FROM invoice_registry
    WHERE shopify_order_number >= 1050
    ORDER BY shopify_order_number DESC
  `).all();

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_invoices,
      SUM(CAST(total_amount AS REAL)) AS total_revenue,
      MAX(shopify_order_number) AS last_order_number,
      MAX(invoice_sequence) AS last_invoice_sequence
    FROM invoice_registry
    WHERE shopify_order_number >= 1050
    `).first();

  return json({
    success: true,
    stats: {
        total_invoices: stats.total_invoices || 0,
        total_revenue: Number(stats.total_revenue || 0).toFixed(2),
        last_order_number: stats.last_order_number || "",
        last_invoice_number: stats.last_invoice_sequence ? `INV-MYONS-${stats.last_invoice_sequence}` : ""
    },
    invoices: rows.results || []
  });
}