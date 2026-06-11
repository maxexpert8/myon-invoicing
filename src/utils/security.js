export function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(String(a || ""));
  const bBytes = encoder.encode(String(b || ""));

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < aBytes.length; i += 1) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

export async function verifyHmacSha256Base64({
  secret,
  payload,
  signature
}) {
  if (!secret || !payload || !signature) {
    return false;
  }

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret).trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, payload);

  const computed = btoa(
    String.fromCharCode(...new Uint8Array(signed))
  );

  return timingSafeEqual(computed, signature);
}