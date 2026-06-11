import { timingSafeEqual, verifyHmacSha256Hex } from "./security.js";

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

  if (!hmac || !env.SHOPIFY_APP_SECRET) {
    return false;
  }

  return await verifyHmacSha256Hex({
    secret: env.SHOPIFY_APP_SECRET,
    payload: buildShopifyHmacMessage(url),
    signature: hmac
  });
}

export function verifyManualSecret(request, env) {
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
