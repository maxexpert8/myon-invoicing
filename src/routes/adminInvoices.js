import { json } from "../utils/response.js";

function isAuthorized(request, env) {
  const url = new URL(request.url);
  const secretFromUrl = url.searchParams.get("secret");
  const secretFromHeader = request.headers.get("x-admin-secret");

  return (
    secretFromUrl === env.MANUAL_SECRET ||
    secretFromHeader === env.MANUAL_SECRET
  );
}

function renderAdminPage(secret) {
  const nonce = crypto.getRandomValues(new Uint8Array(16)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>myon clinic invoices</title>
  <style nonce="${nonce}">
    body { font-family: Arial, sans-serif; padding: 24px; color: #1b2330; }
    h1 { margin-bottom: 16px; }
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
    #downloadZip {
      padding:8px 12px;
      background:#1b2330;
      color:white;
      border:0;
      border-radius:4px;
      cursor:pointer;
    }
  </style>
</head>
<body>
  <h1>myon clinic invoices</h1>
  <div id="stats"></div>
  <div class="downloadZipWrapper">
    <button id="downloadZip">Download selected as ZIP</button>
  </div>
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
      const res = await fetch('/admin/invoices?secret=${secret}');
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
      if (event.target.id !== "downloadZip") return;

      const selected = Array.from(
        document.querySelectorAll(".invoice-check:checked")
      ).map(input => input.value);

      if (selected.length === 0) {
        alert("Please select at least one invoice.");
        return;
      }

      const res = await fetch("/admin/download-zip?secret=${secret}", {
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
    });

    document.addEventListener("change", (event) => {
      if (event.target.id !== "selectAll") return;

      document.querySelectorAll(".invoice-check").forEach(input => {
        input.checked = event.target.checked;
      });
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
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || "";

  return renderAdminPage(secret);
}

export async function handleAdminInvoices(request, env) {
  if (!isAuthorized(request, env)) {
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