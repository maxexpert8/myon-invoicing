function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function buildShopifyHmacMessage(url) {
  const params = new URLSearchParams(url.search);
  params.delete("hmac");
  params.delete("signature");

  return Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function verifyShopifyAdminHmac(request, env) {
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac");

  if (!hmac || !env.SHOPIFY_WEBHOOK_SECRET) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(buildShopifyHmacMessage(url))
  );

  const computed = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(computed, hmac);
}

function verifyManualSecret(request, env) {
  const manualSecret = request.headers.get("x-manual-secret");

  return Boolean(
    manualSecret &&
    env.MANUAL_SECRET &&
    timingSafeEqual(manualSecret, env.MANUAL_SECRET)
  );
}

export async function isAuthorizedAdminRequest(
  request,
  env,
  {
    allowManualSecret = false
  } = {}
) {
  if (allowManualSecret && verifyManualSecret(request, env)) {
    return true;
  }

  return await verifyShopifyAdminHmac(request, env);
}
