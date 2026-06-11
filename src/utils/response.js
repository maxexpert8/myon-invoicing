export function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type"
      }
    }
  );
}