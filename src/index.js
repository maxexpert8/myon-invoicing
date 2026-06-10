import { json } from "./utils/response.js";

import { handleManualInvoice } from "./routes/manualInvoice.js";

import { handleMigrationImportCsv } from "./routes/migration/migrationImportCsv.js";

import { handleShopifyWebhook } from "./routes/shopifyWebhook.js";

import { handleInvoiceLink } from "./routes/invoiceLink.js";

import { handleBackfillPdfs } from "./routes/migration/backfillPdfs.js";

import { handleRegenerateFiles } from "./routes/migration/regenerate-files.js";

import { handleInvoiceDownload } from "./routes/invoiceDownload.js";

import { handleBackfillAdminFields } from "./routes/migration/backfill-admin-fields.js";

import { handleAdminDownloadZip } from "./routes/admin/adminDownloadZip.js";

import { handleAdminPage, handleAdminInvoices } from "./routes/admin/adminInvoices.js";

import { handleAdminReconcile } from "./routes/admin/adminReconcile.js";

import { handleAdminCreateMissingInvoices } from "./routes/admin/adminCreateMissingInvoices.js";

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }

    if (url.pathname === "/invoice-link" && request.method === "GET") {
      return await handleInvoiceLink(request, env);
    }

    if ( url.pathname === "/invoice-download" && (request.method === "GET" || request.method === "HEAD") ) {
      return await handleInvoiceDownload(request, env);
    }

    if (url.pathname === "/migration/backfill-pdfs" && request.method === "POST") {
      return await handleBackfillPdfs(request, env);
    }

    if (url.pathname === "/migration/regenerate-files" && request.method === "POST") {
      return await handleRegenerateFiles(request, env);
    }

    if (url.pathname === "/migration/backfill-admin-fields" && request.method === "POST") {
      return await handleBackfillAdminFields(request, env);
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      return await handleAdminPage(request, env);
    }

    if (url.pathname === "/admin/invoices" && request.method === "GET") {
      return await handleAdminInvoices(request, env);
    }

    if (url.pathname === "/admin/download-zip" && request.method === "POST") {
      return await handleAdminDownloadZip(request, env);
    }

    if (url.pathname === "/admin/reconcile" && request.method === "GET") {
      return await handleAdminReconcile(request, env);
    }

    if (url.pathname === "/admin/create-missing-invoices" && request.method === "POST") {
      return await handleAdminCreateMissingInvoices(request, env);
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