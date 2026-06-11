import { describe, expect, it } from "vitest";
import { handleShopifyWebhook } from "../../src/routes/shopifyWebhook.js";
import { createMockEnv } from "../helpers/mockEnv.js";
import { signShopifyWebhookBody } from "../helpers/hmac.js";

it("returns 400 for malformed JSON with valid HMAC", async () => {
  const env = createMockEnv();
  const body = "{bad json";

  const hmac = await signShopifyWebhookBody(
    body,
    env.SHOPIFY_WEBHOOK_SECRET
  );

  const request = new Request("https://worker.test/webhooks/orders-create", {
    method: "POST",
    headers: {
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-topic": "orders/paid"
    },
    body
  });

  const response = await handleShopifyWebhook(request, env);

  expect(response.status).toBe(400);
});

describe("handleShopifyWebhook", () => {
  it("rejects malformed JSON with 400 instead of crashing", async () => {
    const env = createMockEnv();

    const request = new Request("https://worker.test/webhooks/orders-create", {
      method: "POST",
      headers: {
        "x-shopify-hmac-sha256": "invalid",
        "x-shopify-topic": "orders/paid"
      },
      body: "{bad json"
    });

    const response = await handleShopifyWebhook(request, env);

    expect(response.status).toBe(401);
  });

  it("rejects missing HMAC", async () => {
    const env = createMockEnv();

    const request = new Request("https://worker.test/webhooks/orders-create", {
      method: "POST",
      body: JSON.stringify({})
    });

    const response = await handleShopifyWebhook(request, env);

    expect(response.status).toBe(401);
  });
});