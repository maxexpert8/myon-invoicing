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
