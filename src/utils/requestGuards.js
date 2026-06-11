export function getContentLength(request) {
  const value = request.headers.get("content-length");
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function enforceRequestSize(request, maxBytes) {
  const contentLength = getContentLength(request);

  if (contentLength !== null && contentLength > maxBytes) {
    return new Response(
      JSON.stringify({
        error: "Request body too large"
      }),
      {
        status: 413,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  }

  return null;
}