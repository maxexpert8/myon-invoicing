import { json } from "./utils/response.js";

import { handleManualInvoice } from "./routes/manualInvoice.js";

import { handleMigrationImportCsv } from "./routes/migration/migrationImportCsv.js";

import {
  handleShopifyWebhook,
  processShopifyInvoiceQueueMessage
} from "./routes/shopifyWebhook.js";

import { handleInvoiceLink } from "./routes/invoiceLink.js";

import { handleBackfillPdfs } from "./routes/migration/backfillPdfs.js";

import { handleRegenerateFiles } from "./routes/migration/regenerate-files.js";

import { handleInvoiceDownload } from "./routes/invoiceDownload.js";

import { handleBackfillAdminFields } from "./routes/migration/backfill-admin-fields.js";

import { handleAdminDownloadZip } from "./routes/admin/adminDownloadZip.js";

import { handleAdminPage, handleAdminInvoices } from "./routes/admin/adminInvoices.js";

import { handleAdminReconcile } from "./routes/admin/adminReconcile.js";

import { handleAdminCreateMissingInvoices } from "./routes/admin/adminCreateMissingInvoices.js";

const allowedCorsOrigins = new Set([
  "https://shop.myon.clinic",
  "https://366cba-31.myshopify.com",
  "https://admin.shopify.com"
]);

function corsHeadersForRequest(request) {
  const origin = request.headers.get("origin");

  if (!origin || !allowedCorsOrigins.has(origin)) {
    return null;
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

const publicRoutes = {
  "GET /invoice-link": handleInvoiceLink,
  "GET /invoice-download": handleInvoiceDownload,
  "HEAD /invoice-download": handleInvoiceDownload
};
const adminRoutes = {
  "GET /admin": handleAdminPage,
  "GET /admin/invoices": handleAdminInvoices,
  "POST /admin/download-zip": handleAdminDownloadZip,
  "GET /admin/reconcile": handleAdminReconcile,
  "POST /admin/create-missing-invoices": handleAdminCreateMissingInvoices
};
const webhookRoutes = {
  "POST /webhooks/orders-create": handleShopifyWebhook
};
const manualSecretRoutes = {
  "POST /manual-invoice": handleManualInvoice,
  "POST /migration/import-csv": handleMigrationImportCsv,
  "POST /migration/backfill-pdfs": handleBackfillPdfs,
  "POST /migration/regenerate-files": handleRegenerateFiles,
  "POST /migration/backfill-admin-fields": handleBackfillAdminFields
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const routeKey = `${request.method} ${url.pathname}`;

    if (request.method === "OPTIONS") {
      const corsHeaders = corsHeadersForRequest(request);

      if (!corsHeaders) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    if (publicRoutes[routeKey]) {
      return await publicRoutes[routeKey](request, env);
    }
    if (adminRoutes[routeKey]) {
      return await adminRoutes[routeKey](request, env);
    }
    if (webhookRoutes[routeKey]) {
      return await webhookRoutes[routeKey](request, env);
    }
    if (manualSecretRoutes[routeKey]) {
      const auth = request.headers.get("x-manual-secret");

      if (auth !== env.MANUAL_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }

      return await manualSecretRoutes[routeKey](request, env);
    }

    return json({ error: "Not Found" }, 404);
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      await processShopifyInvoiceQueueMessage(
        message.body,
        env
      );
    }
  }
};
