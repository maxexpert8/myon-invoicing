import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

async function fetchWorker(path, init = {}) {
	const request = new Request(`http://example.com${path}`, init);
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);

	await waitOnExecutionContext(ctx);

	return response;
}

async function signShopifyWebhook(body, secret) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(body)
	);

	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

describe("invoice worker routing and auth", () => {
	it("routes Shopify webhooks before the manual secret gate", async () => {
		const response = await fetchWorker("/webhooks/orders-create", {
			method: "POST",
			body: JSON.stringify({ name: "#1234" })
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			error: "Invalid Shopify webhook signature"
		});
	});

	it("queues valid paid Shopify webhooks without generating inline", async () => {
		const secret = "test-webhook-secret";
		const body = JSON.stringify({
			id: 987654321,
			name: "#1234",
			financial_status: "paid",
			total_price: "99.00",
			total_tax: "15.81",
			line_items: [],
			billing_address: {}
		});
		const sentMessages = [];
		const response = await worker.fetch(
			new Request("http://example.com/webhooks/orders-create", {
				method: "POST",
				headers: {
					"x-shopify-hmac-sha256": await signShopifyWebhook(body, secret),
					"x-shopify-topic": "orders/create",
					"x-shopify-webhook-id": "webhook-1"
				},
				body
			}),
			{
				SHOPIFY_WEBHOOK_SECRET: secret,
				INVOICE_QUEUE: {
					async send(message) {
						sentMessages.push(message);
					}
				},
				DB: {
					prepare() {
						return {
							bind() {
								return {
									async first() {
										return null;
									}
								};
							}
						};
					}
				}
			}
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			success: true,
			queued: true,
			order_number: 1234
		});
		expect(sentMessages).toHaveLength(1);
		expect(sentMessages[0].order.name).toBe("#1234");
	});

	it("keeps manual invoice creation behind the manual secret gate", async () => {
		const response = await fetchWorker("/manual-invoice", {
			method: "POST",
			body: JSON.stringify({ order_number: 1234 })
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			error: "Unauthorized"
		});
	});

	it("keeps migration mutations behind the manual secret gate", async () => {
		const response = await fetchWorker("/migration/backfill-pdfs", {
			method: "POST",
			body: JSON.stringify({ limit: 1 })
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			error: "Unauthorized"
		});
	});

	it("validates public invoice-link query params", async () => {
		const response = await SELF.fetch("http://example.com/invoice-link");

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Missing order_id"
		});
	});

	it("requires a token for public invoice downloads", async () => {
		const response = await SELF.fetch("http://example.com/invoice-download");

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Missing token");
	});
});
