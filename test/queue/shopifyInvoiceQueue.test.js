import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/pdfRenderer.js", () => ({
  uploadInvoicePdf: vi.fn(async (env, { invoiceNumber }) => {
    const pdfKey = `invoices/${invoiceNumber}.pdf`;

    await env.INVOICES.put(pdfKey, "fake pdf", {
      httpMetadata: {
        contentType: "application/pdf"
      }
    });

    return {
      pdfKey
    };
  })
}));

import { processShopifyInvoiceQueueMessage } from "../../src/routes/shopifyWebhook.js";
import { createMockEnv } from "../helpers/mockEnv.js";
import { createPaidShopifyOrder, createEmptyLineItemsOrder, createMalformedTaxOrder } from "../helpers/sampleOrders.js";

describe("processShopifyInvoiceQueueMessage", () => {
  it("does not crash on empty line_items", async () => {
    const env = createMockEnv();
    const order = createEmptyLineItemsOrder();

    await expect(
      processShopifyInvoiceQueueMessage({
        order,
        topic: "orders/paid",
        webhookId: "test-webhook-id",
        receivedAt: new Date().toISOString()
      }, env)
    ).resolves.not.toThrow();
  });

  it("does not crash on malformed tax_lines", async () => {
    const env = createMockEnv();
    const order = createMalformedTaxOrder();

    await expect(
      processShopifyInvoiceQueueMessage({
        order,
        topic: "orders/paid",
        webhookId: "test-webhook-id",
        receivedAt: new Date().toISOString()
      }, env)
    ).resolves.not.toThrow();
  });
});