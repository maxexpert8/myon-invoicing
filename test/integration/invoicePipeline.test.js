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
import { createPaidShopifyOrder } from "../helpers/sampleOrders.js";

describe("invoice generation pipeline", () => {
  it("processes a paid Shopify order through the invoice pipeline", async () => {
    const env = createMockEnv();
    const order = createPaidShopifyOrder();

    await processShopifyInvoiceQueueMessage(
        {
        order,
        topic: "orders/paid",
        webhookId: "test-webhook-id",
        receivedAt: new Date().toISOString()
        },
        env
    );

    const uploadedKeys = Array.from(env.INVOICES.objects.keys());

    expect(uploadedKeys.some(key => key.endsWith(".html"))).toBe(true);
    expect(uploadedKeys.some(key => key.endsWith(".pdf"))).toBe(true);
    expect(uploadedKeys.some(key => key.startsWith("invoices/INV-MYONS-"))).toBe(true);

    const htmlKey = uploadedKeys.find(key => key.endsWith(".html"));
    const htmlObject = env.INVOICES.objects.get(htmlKey);
    const html = String(htmlObject.value);

    expect(html).toContain("Karina Wagner");
    expect(html).toContain("Benneckenrode 32");
    expect(html).toContain("Digitale Begleitung von Dr. Franziska Rubin");
    });
});