import Papa from "papaparse";
import { countryName } from "../utils/invoiceDataHelpers.js";

import {
  cleanValue,
  cleanZip,
  cleanMoney,
  extractVatRate,
  parseShopifyCsvDate
} from "../utils/formatting.js";

const SKIPPED_ORDER_NUMBERS = new Set([
  1053,
  1054,
  1055
]);

const DEFAULT_MIGRATION_PRODUCT_IMAGE = "https://cdn.shopify.com/s/files/1/0863/0622/6507/files/Dr._Rubin_Digitale_Begleitung_Mobile.png";


function getTaxTitleWithoutRate(taxName) {
  return cleanValue(taxName)
    .replace(/\s*\d+(?:[.,]\d+)?%/g, "")
    .trim();
}

function getLineGross(row) {
  const quantity = Number(row["Lineitem quantity"] || 1);
  const unitPrice = Number(cleanMoney(row["Lineitem price"]));

  return (quantity * unitPrice).toFixed(2);
}

function allocateItemTax(order, item) {
  const orderTotalGross = Number(order.total || 0);
  const orderTaxTotal = Number(order.taxes || 0);
  const lineGross = Number(item.lineGross || 0);

  if (!orderTotalGross || !orderTaxTotal || !lineGross) {
    return "0.00";
  }

  return (
    orderTaxTotal *
    (lineGross / orderTotalGross)
  ).toFixed(2);
}

function calculateLineNet(lineGross, taxAmount) {
  return (
    Number(lineGross || 0) -
    Number(taxAmount || 0)
  ).toFixed(2);
}

function buildVatSummary(items, fallbackTaxName, fallbackTaxValue) {
  const vatMap = new Map();

  for (const item of items) {
    const title = item.taxFullTitle || fallbackTaxName || "DE MwSt 19%";
    const rate = item.taxRate || extractVatRate(title);
    const amount = Number(item.taxAmount || 0);

    if (!vatMap.has(title)) {
      vatMap.set(title, {
        title,
        rate,
        amount: 0
      });
    }

    vatMap.get(title).amount += amount;
  }

  if (vatMap.size === 0) {
    const title = fallbackTaxName || "DE MwSt 19%";

    return [
      {
        title,
        rate: extractVatRate(title),
        amount: cleanMoney(fallbackTaxValue || 0)
      }
    ];
  }

  return Array.from(vatMap.values()).map(vat => ({
    title: vat.title,
    rate: vat.rate,
    amount: vat.amount.toFixed(2)
  }));
}

export function parseMigrationCsv(
  csvText,
  {
    invoicePrefix = "INV-MYONS-",
    startingInvoiceSequence = 10001,
    maxRows = 25000
  } = {}
) {
  if (!csvText || typeof csvText !== "string") {
    throw new Error("CSV text is required");
  }

  const grouped = new Map();
  let rowCount = 0;
  let parseError = null;

  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    step(result, parser) {
      if (result.errors?.length) {
        parseError = result.errors[0];
        parser.abort();
        return;
      }

      rowCount += 1;

      if (rowCount > maxRows) {
        parseError = new Error(
          `CSV row limit exceeded. Maximum allowed rows: ${maxRows}`
        );
        parser.abort();
        return;
      }

      const row = result.data;

      const orderNumber = Number(
        String(row.Name || "")
          .replace("#", "")
          .trim()
      );

      if (!orderNumber) {
        return;
      }

      if (SKIPPED_ORDER_NUMBERS.has(orderNumber)) {
        return;
      }

      const taxName =
        cleanValue(row["Tax 1 Name"]) ||
        "DE MwSt 19%";

      const taxRate = extractVatRate(taxName);
      const taxTitle = getTaxTitleWithoutRate(taxName);
      const billingCountry = cleanValue(row["Billing Country"]);

      if (!grouped.has(orderNumber)) {
        grouped.set(orderNumber, {
          orderNumber,

          shopifyOrderId:
            cleanValue(row.Id),

          createdAt:
            cleanValue(row["Created at"]),

          email:
            cleanValue(row.Email),

          billingName:
            cleanValue(row["Billing Name"]),

          billingCompany:
            cleanValue(row["Billing Company"]),

          billingAddress1:
            cleanValue(row["Billing Address1"]),

          billingAddress2:
            cleanValue(row["Billing Address2"]),

          billingCity:
            cleanValue(row["Billing City"]),

          billingZip:
            cleanZip(row["Billing Zip"]),

          billingCountry,

          billingCountryName:
            countryName(billingCountry),

          paymentMethod:
            cleanValue(row["Payment Method"]),

          subtotal:
            cleanMoney(row.Subtotal),

          taxes:
            cleanMoney(row.Taxes),

          total:
            cleanMoney(row.Total),

          taxName,

          taxRate,

          taxTitle,

          taxValue:
            cleanMoney(row["Tax 1 Value"]),

          items: []
        });
      }

      const order = grouped.get(orderNumber);
      const quantity = Number(row["Lineitem quantity"] || 1);
      const unitPrice = cleanMoney(row["Lineitem price"]);
      const lineGross = getLineGross(row);

      order.items.push({
        productImage: DEFAULT_MIGRATION_PRODUCT_IMAGE,

        productName:
          cleanValue(row["Lineitem name"]),

        quantity,

        taxTitle,

        taxRate,

        taxFullTitle:
          taxName,

        unitPrice,

        lineGross,

        taxAmount:
          "0.00",

        lineNet:
          lineGross
      });
    }
  });

  if (parseError) {
    throw new Error(
      parseError.message || String(parseError)
    );
  }

  const realOrders =
    Array.from(grouped.values())
      .sort(
        (a, b) =>
          a.orderNumber - b.orderNumber
      );

  let currentSequence = startingInvoiceSequence;

  for (const order of realOrders) {
    order.invoiceSequence = currentSequence;

    order.invoiceNumber =
      `${invoicePrefix}${currentSequence}`;

    order.issuedAt =
      parseShopifyCsvDate(order.createdAt);

    order.customerFullName =
      order.billingName;

    order.customerName =
      order.billingName;

    order.customerEmail =
      order.email;

    order.primaryTaxTitle =
      order.taxName;

    order.totalGross =
      order.total;

    order.vatAmount =
      order.taxes;

    order.totalNet =
      (
        Number(order.total || 0) -
        Number(order.taxes || 0)
      ).toFixed(2);

    order.items = order.items.map(item => {
      const taxAmount = allocateItemTax(order, item);

      return {
        ...item,
        taxAmount,
        lineNet: calculateLineNet(
          item.lineGross,
          taxAmount
        )
      };
    });

    order.vatSummary = buildVatSummary(
      order.items,
      order.taxName,
      order.taxValue
    );

    order.outstandingAmount = "0.00";

    currentSequence++;
  }

  return realOrders;
}