export function createMockD1() {
  const tables = {
    invoice_registry: new Map(),
    invoice_counter: new Map([
      [
        "MYONS_MAIN",
        {
          key: "MYONS_MAIN",
          next_number: 10034
        }
      ]
    ])
  };

  function findInvoiceByOrderNumber(orderNumber) {
    return Array.from(tables.invoice_registry.values())
      .find(row => Number(row.shopify_order_number) === Number(orderNumber)) || null;
  }

  function findInvoiceByInvoiceNumber(invoiceNumber) {
    return Array.from(tables.invoice_registry.values())
      .find(row => row.invoice_number === invoiceNumber) || null;
  }

  return {
    tables,

    prepare(sql) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();

      return {
        bind(...params) {
          return {
            async first() {
              if (
                normalizedSql.includes("UPDATE invoice_counter") &&
                normalizedSql.includes("RETURNING next_number - 1 AS invoice_sequence")
              ) {
                const key = params[0];
                const counter = tables.invoice_counter.get(key);

                if (!counter) {
                  return null;
                }

                const invoiceSequence = counter.next_number;
                counter.next_number += 1;

                return {
                  invoice_sequence: invoiceSequence
                };
              }

              if (
                normalizedSql.includes("FROM invoice_registry") &&
                normalizedSql.includes("WHERE shopify_order_number = ?")
              ) {
                return findInvoiceByOrderNumber(params[0]);
              }

              if (
                normalizedSql.includes("FROM invoice_registry") &&
                normalizedSql.includes("WHERE invoice_number = ?")
              ) {
                return findInvoiceByInvoiceNumber(params[0]);
              }

              return null;
            },

            async run() {
              if (
                normalizedSql.includes("INSERT INTO invoice_registry")
              ) {
                const [
                  shopifyOrderId,
                  orderNumber,
                  invoiceSequence,
                  invoiceNumber,
                  pdfUrl,
                  pdfKey,
                  status,
                  source,
                  issuedAt,
                  customerName,
                  customerEmail,
                  totalAmount,
                  downloadToken,
                  invoiceError = null
                ] = params;

                tables.invoice_registry.set(invoiceNumber, {
                  shopify_order_id: String(shopifyOrderId),
                  shopify_order_number: Number(orderNumber),
                  invoice_sequence: Number(invoiceSequence),
                  invoice_number: invoiceNumber,
                  pdf_url: pdfUrl,
                  pdf_key: pdfKey,
                  status,
                  source,
                  issued_at: issuedAt,
                  customer_name: customerName,
                  customer_email: customerEmail,
                  total_amount: totalAmount,
                  download_token: downloadToken,
                  invoice_error: invoiceError
                });
              }

              if (
                normalizedSql.includes("UPDATE invoice_registry") &&
                normalizedSql.includes("SET pdf_url = ?") &&
                normalizedSql.includes("pdf_key = ?") &&
                normalizedSql.includes("status = ?")
              ) {
                const [
                  pdfUrl,
                  pdfKey,
                  status,
                  invoiceNumber
                ] = params;

                const row = tables.invoice_registry.get(invoiceNumber);

                if (row) {
                  row.pdf_url = pdfUrl;
                  row.pdf_key = pdfKey;
                  row.status = status;
                  row.invoice_error = null;
                }
              }

              if (
                normalizedSql.includes("UPDATE invoice_registry") &&
                normalizedSql.includes("SET status = ?") &&
                normalizedSql.includes("invoice_error = NULL")
              ) {
                const [
                  status,
                  invoiceNumber
                ] = params;

                const row = tables.invoice_registry.get(invoiceNumber);

                if (row) {
                  row.status = status;
                  row.invoice_error = null;
                }
              }

              if (
                normalizedSql.includes("UPDATE invoice_registry") &&
                normalizedSql.includes("invoice_error = ?")
              ) {
                const [
                  status,
                  invoiceError,
                  invoiceNumber
                ] = params;

                const row = tables.invoice_registry.get(invoiceNumber);

                if (row) {
                  row.status = status;
                  row.invoice_error = invoiceError;
                }
              }

              return {
                success: true,
                meta: {}
              };
            },

            async all() {
              return {
                results: Array.from(tables.invoice_registry.values())
              };
            }
          };
        }
      };
    }
  };
}

export function createMockR2() {
  const objects = new Map();

  return {
    objects,
    async put(key, value, options = {}) {
      objects.set(key, {
        value,
        options
      });

      return null;
    },
    async get(key) {
      const object = objects.get(key);

      if (!object) {
        return null;
      }

      return {
        body: object.value,
        httpMetadata: object.options.httpMetadata || {},
        writeHttpMetadata(headers) {
          for (const [key, value] of Object.entries(this.httpMetadata)) {
            headers.set(key, value);
          }
        }
      };
    }
  };
}

export function createMockQueue() {
  const messages = [];

  return {
    messages,
    async send(body) {
      messages.push(body);
    }
  };
}

export function createMockEnv(overrides = {}) {
  return {
    DB: createMockD1(),
    INVOICES: createMockR2(),
    INVOICE_QUEUE: createMockQueue(),
    INVOICE_PREFIX: "INV-MYONS-",
    SHOPIFY_WEBHOOK_SECRET: "test-webhook-secret",
    SHOPIFY_APP_SECRET: "test-app-secret",
    SHOPIFY_ADMIN_API_TOKEN: "test-admin-token",
    SHOPIFY_SHOP_DOMAIN: "366cba-31.myshopify.com",
    SHOPIFY_API_VERSION: "2026-04",
    MANUAL_SECRET: "test-manual-secret",
    ALLOW_MIGRATION_ROUTES: "false",
    ...overrides
  };
}