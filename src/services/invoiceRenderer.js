import {
  escapeHtml,
  formatEuro,
  formatGermanDate
} from "../utils/formatting.js";

function calculateInvoiceTotals(data) {
  const items = Array.isArray(data.items) ? data.items : [];

  const subtotalGross = items.reduce(
    (sum, item) => sum + Number(item.lineGross || 0),
    0
  );

  const totalTax = items.reduce(
    (sum, item) => sum + Number(item.taxAmount || 0),
    0
  );

  const subtotalNet = items.reduce(
    (sum, item) => sum + Number(item.lineNet || 0),
    0
  );

  const fallbackGross = Number(data.totalGross || 0);
  const fallbackTax = Number(data.vatAmount || 0);
  const fallbackNet = Number(data.totalNet || 0);

  return {
    subtotalGross: subtotalGross || fallbackGross,
    totalTax: totalTax || fallbackTax,
    subtotalNet: subtotalNet || fallbackNet,
    grandTotal: subtotalGross || fallbackGross,
    finalPrice: subtotalGross || fallbackGross,
    outstandingAmount: Number(data.outstandingAmount || 0)
  };
}

function buildVatRows(data) {
  if (Array.isArray(data.vatSummary) && data.vatSummary.length > 0) {
    return data.vatSummary;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const groupedVat = new Map();

  for (const item of items) {
    const rate = item.taxRate || data.vatRate || "19%";
    const amount = Number(item.taxAmount || 0);

    groupedVat.set(
      rate,
      (groupedVat.get(rate) || 0) + amount
    );
  }

  if (groupedVat.size === 0) {
    return [
      {
        rate: data.vatRate || "19%",
        amount: data.vatAmount || "0.00"
      }
    ];
  }

  return Array.from(groupedVat.entries()).map(
    ([rate, amount]) => ({
      rate,
      amount: amount.toFixed(2)
    })
  );
}

// ---------- helper functions (styles removed, classes added) ----------
function renderProductImage(productImage) {
  if (!productImage) {
    return "";
  }

  return `
    <img
      src="${escapeHtml(productImage)}"
      alt=""
      class="inv-item-img"
    >
  `;
}

function renderAddressLines(lines = []) {
  return lines
    .filter(Boolean)
    .map(line => `
      <p class="inv-address-line-wrap">
        ${escapeHtml(line)}
      </p>
    `)
    .join("");
}

function getTaxLabelWithoutRate(label = "") {
  return String(label)
    .replace(/\s*\d+(?:[.,]\d+)?%/g, "")
    .trim();
}

// ---------- main invoice HTML ----------
export function renderInvoiceHtml(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const totals = calculateInvoiceTotals(data);
  const vatRows = buildVatRows(data);
  const nonce = crypto.getRandomValues(new Uint8Array(16)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

  const customerLines = [
    data.customerFullName ||
    data.customerName ||
    data.billingName ||
    "",

    data.customerEmail || "",

    data.billingAddress1 || "",

    data.billingAddress2 || "",

    [
      data.billingZip || "",
      data.billingCity || ""
    ].filter(Boolean).join(" "),

    data.billingCountryName ||
    data.billingCountry || ""
  ].filter(Boolean);

  const billingLines = [
    data.billingName ||
    data.customerName ||
    "",

    data.billingCompany || "",

    data.billingAddress1 || "",

    data.billingAddress2 || "",

    [
      data.billingZip || "",
      data.billingCity || ""
    ].filter(Boolean).join(" "),

    data.billingCountryName ||
    data.billingCountry || ""
  ].filter(Boolean);

  const itemsHtml = items.length > 0
    ? items.map(item => {
        const quantity = Number(item.quantity || 1);
        const unitPrice = item.unitPrice ?? item.lineGross ?? 0;
        const lineGross = item.lineGross ?? Number(unitPrice) * quantity;
        const taxRate = item.taxRate || data.vatRate || "19%";
        const taxLabel = taxRate;
        return `
          <div class="inv-item-row">
            <div class="inv-item-detail">
              ${renderProductImage(item.productImage)}
              <div class="inv-item-name">
                ${escapeHtml(item.productName || "Produkt")}
              </div>
            </div>
            <div>${escapeHtml(quantity)}</div>
            <div>${escapeHtml(taxLabel)}</div>
            <div>${formatEuro(unitPrice)}</div>
            <div>${formatEuro(lineGross)}</div>
          </div>
        `;
      }).join("")
    : `<div class="inv-item-empty">Keine Artikel gefunden</div>`;

  const vatRowsHtml = vatRows.map(vat => `
    <div class="inv-total-row">
      <div class="inv-total-label">
        ${escapeHtml(vat.title || `MwSt. (${vat.rate})`)}
      </div>
      <div class="inv-total-value">
        ${formatEuro(vat.amount)}
      </div>
    </div>
  `).join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data.invoiceNumber)}</title>
  <style nonce="${nonce}">
    @font-face {
      font-family: 'UbuntuLight';
      src: url('https://fonts.gstatic.com/s/ubuntu/v20/4iCs6KVjbNBYlgoKcg72n8Af.woff2') format('woff2');
      font-weight: 300;
    }
    @media print {
      @page {
        size: A4;
        margin: 6mm;
      }

      html,body {
        width: 210mm;
        min-height: auto;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        }

      * {
        box-sizing: border-box;
      }

      a {
        color: inherit;
        text-decoration: none;
      }
    }

    .title-type {
      font-size: 38px;
      letter-spacing: 1px;
      font-style: normal;
      font-weight: 700;
      line-height: normal;
      text-transform: uppercase;
      height: 50px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 300px;
      max-width: 300px;
      color: #ed953f !important;
      margin-bottom: 20px;
    }
    .inv-body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1b2330;
      margin: 0;
      padding: 18px 28px;
      font-size: 14px;
      line-height: 1.5;
      background: #fff;
    }
    .inv-container {
      max-width: 980px;
      margin: 0 auto;
      position: relative;
    }
    .inv-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .inv-header-left {
      flex: 1;
    }
    .inv-order-info {
      margin-bottom: 20px;
    }
    .inv-p-5 {
      margin: 0 0 5px 0;
    }
    .inv-highlight {
      color: #ed953f;
    }
    .inv-header-right {
      text-align: right;
      flex: 1;
    }
    .inv-logo {
      width: 200px;
      height: auto;
      margin-bottom: 15px;
    }
    .inv-company-name {
      margin: 0 0 3px 0;
      font-weight: 700;
    }
    .inv-address-line {
      margin: 0 0 3px 0;
    }
    .inv-address-line-wrap {
      margin: 0 0 3px 0;
      word-wrap: break-word;
    }
    .inv-details-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .inv-details-col {
      flex: 1;
      padding-right: 20px;
    }
    .inv-section-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0 0 10px 0;
      color: #ed953f;
    }
    .inv-items-wrapper {
      width: 100%;
    }
    .inv-grid-header {
      display: grid;
      grid-template-columns: 3fr 0.7fr 1fr 1fr 1fr;
      background-color: #1b2330;
      color: #fff;
      padding: 10px 8px;
      font-weight: 700;
      text-align: right;
      border-bottom: 3px solid #ed953f;
      column-gap: 12px;
    }
    .inv-grid-header-left {
      text-align: left;
    }
    .inv-item-row {
      display: grid;
      grid-template-columns: 3fr 0.7fr 1fr 1fr 1fr;
      border-bottom: 1px solid #eee;
      padding: 12px 8px;
      text-align: right;
      align-items: center;
      column-gap: 12px;
    }
    .inv-item-detail {
      display: flex;
      gap: 12px;
      align-items: center;
      text-align: left;
      min-width: 0;
    }
    .inv-item-name {
      word-break: break-word;
      line-height: 1.35;
    }
    .inv-item-img {
      width: auto;
      height: 100px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #ddd;
      flex-shrink: 0;
    }
    .inv-item-empty {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .inv-footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
    }
    .inv-footer-payment {
      flex: 1;
      padding-right: 20px;
      margin-top: 20px;
    }
    .inv-totals-box {
      flex: 1;
      border: 1px solid #eee;
    }
    .inv-total-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      border-bottom: 1px solid #eee;
      min-height: 35px;
      align-items: center;
    }
    .inv-total-row:last-child {
      border-bottom: none;
    }
    .inv-total-label {
      border-right: 1px solid #eee;
      padding: 5px 14px;
      font-weight: 800;
      font-size: 15px;
      text-align: right;
    }
    .inv-total-value {
      padding: 5px 14px;
      font-size: 15px;
      text-align: right;
    }
    .inv-thankyou {
      flex: 1.3;
      padding-right: 20px;
      margin-top: 20px;
      text-align: center;
    }
    .inv-thankyou-title {
      font-weight: 700;
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #ed953f;
    }
    .inv-thankyou-text {
      margin: 0;
      font-size: 14px;
    }
    .inv-company-info-row {
      display: flex;
      justify-content: space-between;
      text-align: left;
      margin-top: 50px;
      font-size: 14px;
    }
    .inv-info-title {
      margin: 0 0 5px 0;
      color: #ed953f;
      font-weight: 700;
    }
    .inv-info-text {
      margin: 0;
    }
  </style>
</head>
<body class="inv-body">
  <div class="inv-container">

    <!-- Header -->
    <div class="inv-header-row">
      <div class="inv-header-left">
        <div class="title-type">Rechnung</div>
        <div class="inv-order-info">
          <p class="inv-p-5"><strong class="inv-highlight">Rechnungsnummer:</strong> ${escapeHtml(data.invoiceNumber)}</p>
          <p class="inv-p-5"><strong class="inv-highlight">Bestellnummer:</strong> #${escapeHtml(data.orderNumber)}</p>
          <p class="inv-p-5"><strong class="inv-highlight">Bestelldatum:</strong> ${formatGermanDate(data.issuedAt)}</p>
        </div>
      </div>

      <div class="inv-header-right">
        <svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" overflow="hidden" xml:space="preserve" width="200" height="auto" viewBox="0 0 1630 269" class="inv-logo">
          <defs>
            <clipPath id="clip0"><rect height="269" width="1630" y="728" x="1306"/></clipPath>
            <linearGradient id="fill1" spreadMethod="reflect" gradientUnits="userSpaceOnUse" y2="1590.36" x2="1291.87" y1="1342.36" x1="1291.87">
              <stop stop-color="#E72583" offset="0"/>
              <stop stop-color="#E72583" offset="0.02"/>
              <stop stop-color="#ED953F" offset="1"/>
            </linearGradient>
          </defs>
          <g transform="translate(-1306 -728)" clip-path="url(#clip0)">
            <text transform="matrix(0.770296 0 0 0.770185 1594.09 941)" font-size="353" font-weight="300" font-family="UbuntuLight, sans-serif">myon</text>
            <text transform="matrix(0.770296 0 0 0.770185 2270.41 941)" font-size="353" font-weight="300" font-family="UbuntuLight, sans-serif">.</text>
            <text transform="matrix(0.770296 0 0 0.770185 2337.43 941)" font-size="353" font-weight="300" font-family="UbuntuLight, sans-serif">clinic</text>
            <path transform="matrix(1.00014 0 0 1 144.394 -595.53)" fill-rule="evenodd" fill="url(#fill1)" d="M1340.24 1342.36C1322.47 1342.36 1305.39 1348.53 1291.77 1359.7 1278.14 1348.7 1261.09 1342.53 1243.3 1342.36 1198.13 1342.36 1162.09 1381.36 1162.09 1429.36 1162.09 1449.2 1168.65 1468.37 1180.89 1484.36 1187.44 1493.03 1216.76 1525.2 1269.87 1581.04L1271.07 1582.2C1282.47 1593.2 1300.91 1593.03 1312.12 1582.03 1312.29 1581.87 1312.63 1581.54 1312.81 1581.2L1313.15 1580.87C1366.62 1524.53 1396.28 1492.7 1402.84 1484.2 1415.41 1468.37 1421.97 1449.03 1421.63 1429.2 1421.45 1381.7 1385.59 1342.36 1340.24 1342.36L1340.24 1342.36ZM1291.94 1388.54C1300.22 1400.53 1304.54 1414.37 1304.72 1428.7 1304.72 1437.03 1298.83 1443.2 1291.94 1443.2 1285.05 1443.2 1279.18 1436.7 1279.18 1428.7 1279.36 1414.37 1283.83 1400.53 1291.94 1388.54ZM1387.48 1472.36C1381.45 1479.86 1351.78 1512.03 1299.01 1567.03 1295.4 1570.86 1289.36 1571.2 1285.38 1567.7 1285.38 1567.7 1285.22 1567.53 1285.22 1567.53L1284.87 1567.2 1284.18 1566.53C1231.76 1511.7 1202.27 1479.53 1196.41 1472.03 1187.09 1459.36 1182.09 1444.2 1182.09 1428.7 1182.09 1390.87 1209.51 1361.2 1243.3 1361.2 1255.89 1361.2 1268.32 1365.53 1277.97 1373.36 1265.39 1389.2 1258.84 1408.53 1259.18 1428.36 1259.18 1447.2 1273.5 1462.7 1291.77 1462.7 1310.06 1462.7 1324.2 1447.2 1324.2 1428.36 1324.2 1408.53 1317.65 1389.37 1305.39 1373.36 1315.4 1365.86 1327.46 1361.86 1340.06 1361.86 1373.86 1361.86 1401.28 1391.53 1401.28 1428.36 1401.81 1444.37 1396.8 1459.7 1387.48 1472.36L1387.48 1472.36Z"/>
          </g>
        </svg>
        <p class="inv-company-name">myon clinic GmbH</p>
        <p class="inv-address-line">Balanstraße 71a</p>
        <p class="inv-address-line">81541 München</p>
        <p class="inv-address-line">Deutschland</p>
      </div>
    </div>

    <!-- Buyer & Billing details -->
    <div class="inv-details-row">
      <div class="inv-details-col">
        <p class="inv-section-title">Käuferdetails</p>
        ${renderAddressLines(customerLines)}
      </div>
      <div class="inv-details-col">
        <p class="inv-section-title">Rechnungsadresse</p>
        ${renderAddressLines(billingLines)}
      </div>
    </div>

    <!-- Items table -->
    <div class="inv-items-wrapper">
      <div class="inv-grid-header">
        <div class="inv-grid-header-left">Artikel</div>
        <div>Menge</div>
        <div>
          ${escapeHtml(
            (
              getTaxLabelWithoutRate(
                data.primaryTaxTitle || "MwSt."
              ) + "."
            ).replace("..", ".")
          )}
        </div>
        <div>Stückpreis</div>
        <div>Gesamt</div>
      </div>
      ${itemsHtml}
    </div>

    <!-- Totals & Payment -->
    <div class="inv-footer-row">
      <div class="inv-footer-payment">
        <p class="inv-p-5"><strong class="inv-highlight">Bezahlt via</strong></p>
        <p class="inv-address-line">${escapeHtml(data.paymentMethod || "#shopify_payments")}</p>
      </div>

      <div class="inv-totals-box">
        <div class="inv-total-row">
          <div class="inv-total-label">Zwischensumme</div>
          <div class="inv-total-value">${formatEuro(totals.subtotalGross)}</div>
        </div>

        ${vatRowsHtml}

        <div class="inv-total-row">
          <div class="inv-total-label">Gesamtpreis ohne Steuer</div>
          <div class="inv-total-value">${formatEuro(totals.subtotalNet)}</div>
        </div>

        <div class="inv-total-row">
          <div class="inv-total-label">Gesamt</div>
          <div class="inv-total-value">${formatEuro(totals.grandTotal)}</div>
        </div>

        <div class="inv-total-row">
          <div class="inv-total-label">Endpreis</div>
          <div class="inv-total-value">${formatEuro(totals.finalPrice)}</div>
        </div>

        <div class="inv-total-row">
          <div class="inv-total-label">Offener Betrag</div>
          <div class="inv-total-value">${formatEuro(totals.outstandingAmount)}</div>
        </div>
      </div>
    </div>

    <!-- Thank you -->
    <div class="inv-thankyou">
      <p class="inv-thankyou-title">Vielen Dank für Ihren Kauf im myon clinic Shop</p>
      <p class="inv-thankyou-text">Bitte beachten Sie folgendes:<br>Wenn nicht anders angegeben, entspricht das Rechnungsdatum dem Datum der Leistungserbringung.</p>
    </div>

    <!-- Company info footer -->
    <div class="inv-company-info-row">
      <div>
        <p class="inv-info-title">CEO / Managing Director</p>
        <p class="inv-info-text">Katharina Hieronimi</p>
      </div>
      <div>
        <p class="inv-info-title">Commercial Register</p>
        <p class="inv-info-text">Registergericht München</p>
        <p class="inv-info-text">HRB 280310</p>
        <p class="inv-info-text">VAT ID DE357709921</p>
      </div>
      <div>
        <p class="inv-info-title">Bankdetails</p>
        <p class="inv-info-text">HypoVereinsbank</p>
        <p class="inv-info-text">IBAN DE54 7002 0270 0037</p>
      </div>
    </div>

  </div>
</body>
</html>`;
}