import { json } from "./utils/response.js";

import { verifyManualSecret } from "./utils/adminAuth.js";

import { handleManualInvoice } from "./routes/manualInvoice.js";

import { handleMigrationImportCsv } from "./routes/migration/migrationImportCsv.js";

import { handleShopifyWebhook, processShopifyInvoiceQueueMessage } from "./routes/shopifyWebhook.js";

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

function withCors(response, request) {
  const corsHeaders = corsHeadersForRequest(request);

  if (!corsHeaders) {
    return response;
  }

  const headers = new Headers(response.headers);

  headers.set("access-control-allow-origin", corsHeaders["access-control-allow-origin"]);
  headers.set("access-control-allow-methods", corsHeaders["access-control-allow-methods"]);
  headers.set("access-control-allow-headers", corsHeaders["access-control-allow-headers"]);
  headers.set("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
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
    try {
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
        return withCors(await publicRoutes[routeKey](request, env), request);
      }
      if (adminRoutes[routeKey]) {
        return withCors(await adminRoutes[routeKey](request, env), request);
      }
      if (webhookRoutes[routeKey]) {
        return withCors(await webhookRoutes[routeKey](request, env), request);
      }
      if (manualSecretRoutes[routeKey]) {
        if (!verifyManualSecret(request, env)) {
          return withCors(json({ error: "Unauthorized" }, 401), request);
        }
        if (url.pathname.startsWith("/migration/") && env.ALLOW_MIGRATION_ROUTES !== "true") {
          return withCors(json({ error: "Migration routes are disabled" }, 403), request);
        }

        return withCors(await manualSecretRoutes[routeKey](request, env), request);
      }

      return withCors(json({ error: "Not Found" }, 404), request);
    } catch (error) {
      console.error("Unhandled Worker fetch error", {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        method: request?.method,
        url: request?.url
      });

      return withCors(json({
        error: "Internal Server Error"
      }, 500), request);
    }
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
