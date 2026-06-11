

export async function renderPdfFromHtml(env, html) {
  if (!env.BROWSER) {
    throw new Error(
      "Missing Cloudflare Browser binding. Add [browser] binding = \"BROWSER\" to wrangler.toml."
    );
  }

  const response = await env.BROWSER.quickAction("pdf", {
    html,
    pdfOptions: {
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "6mm",
        right: "6mm",
        bottom: "6mm",
        left: "6mm"
      }
    }
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `PDF rendering failed: ${response.status} ${errorText}`
    );
  }

  return await response.arrayBuffer();
}

export async function uploadInvoicePdf(
  env,
  {
    invoiceNumber,
    invoiceHtml
  }
) {
  const pdfBuffer = await renderPdfFromHtml(
    env,
    invoiceHtml
  );

  const fileName =
    `invoices/${invoiceNumber}.pdf`;

  await env.INVOICES.put(
    fileName,
    pdfBuffer,
    {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition:
          `inline; filename=\"${invoiceNumber}.pdf\"`
      }
    }
  );

  return {
    fileName,
    pdfKey: fileName,
    fileUrl: fileName
  };
}
