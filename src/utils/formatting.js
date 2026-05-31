export function formatGermanDate(value) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("de-DE").format(date);
}

export function formatEuro(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(number);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function cleanValue(value) {
  return String(value ?? "").trim();
}

export function cleanZip(value) {
  return cleanValue(value).replace(/^'/, "");
}

export function cleanMoney(value) {
  const cleaned = cleanValue(value).replace(",", ".");
  const number = Number(cleaned || 0);

  return number.toFixed(2);
}

export function extractVatRate(taxName) {
  const match = String(taxName || "")
    .match(/(\d+(?:[.,]\d+)?)%/);

  return match
    ? `${match[1].replace(",", ".")}%`
    : "19%";
}

export function parseShopifyCsvDate(value) {
  const cleaned = cleanValue(value);

  if (!cleaned) {
    return new Date().toISOString();
  }

  const normalized = cleaned
    .replace(" ", "T")
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}