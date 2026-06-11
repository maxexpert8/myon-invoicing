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

export async function createHmacSha256Hex({
  secret,
  payload
}) {
  if (!secret || payload === undefined || payload === null) {
    return "";
  }

  const encoder = new TextEncoder();
  const payloadBytes =
    payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)
      ? payload
      : encoder.encode(String(payload));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret).trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    payloadBytes
  );

  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHmacSha256Hex({
  secret,
  payload,
  signature
}) {
  if (!secret || !signature || payload === undefined || payload === null) {
    return false;
  }

  const computed = await createHmacSha256Hex({
    secret,
    payload
  });

  return timingSafeEqual(computed, signature);
}