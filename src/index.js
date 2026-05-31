import Papa from "papaparse";

import { json } from "./utils/response.js";

import { handleManualInvoice } from "./routes/manualInvoice.js";

import { handleMigrationImportCsv } from "./routes/migrationImportCsv.js";

import { handleShopifyWebhook } from "./routes/shopifyWebhook.js";

import { handleInvoiceLink } from "./routes/invoiceLink.js";

export default {
  async fetch(request, env) {

    const url =
      new URL(request.url);

    if (url.pathname === "/invoice-link" && request.method === "GET") {
      return await handleInvoiceLink(request, env);
    }

    if (request.method !== "POST") {
      return json({
        error:
          "Method Not Allowed"
      }, 405);
    }

    const auth =
      request.headers.get(
        "x-manual-secret"
      );

    if (
      auth !== env.MANUAL_SECRET
    ) {
      return json({
        error: "Unauthorized"
      }, 401);
    }

    if (
      url.pathname ===
      "/manual-invoice"
    ) {
      return await handleManualInvoice(
        request,
        env
      );
    }

    if (
      url.pathname ===
      "/migration/import-csv"
    ) {
      return await handleMigrationImportCsv(
        request,
        env
      );
    }

    if (
      url.pathname ===
      "/webhooks/orders-create"
    ) {
      return await handleShopifyWebhook(
        request,
        env
      );
    }

    return json({
      error: "Not Found"
    }, 404);
  }
};