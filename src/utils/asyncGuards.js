export async function withTimeout(promise, timeoutMs, label = "operation") {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      promise,
      timeout
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}