import productImages from "../../products_images.json";

const COUNTRY_NAMES = {
  DE: "Germany",
  SE: "Sweden",
  AT: "Austria",
  CH: "Switzerland",
  NL: "Netherlands",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  GB: "United Kingdom",
  US: "United States"
};

export function countryName(code) {
  const normalizedCode = String(code || "").toUpperCase();

  return COUNTRY_NAMES[normalizedCode] || code || "";
}

export function getProductImage(line = {}) {
  const productName =
    line.title ||
    line.name ||
    line.lineitemName ||
    line.productName ||
    "";

  return (
    productImages[productName] ||
    line.image ||
    line.productImage ||
    ""
  );
}