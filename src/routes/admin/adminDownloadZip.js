import { zipSync } from "fflate";
import { isAuthorizedAdminRequest } from "../../utils/adminAuth.js";

export async function handleAdminDownloadZip(request, env) {
  if (!(await isAuthorizedAdminRequest(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  const invoiceNumbers = Array.isArray(body.invoice_numbers)
    ? body.invoice_numbers
    : [];

  if (invoiceNumbers.length === 0) {
    return new Response("No invoices selected", { status: 400 });
  }

  if (invoiceNumbers.length > 50) {
    return new Response("Maximum 50 invoices per ZIP", { status: 400 });
  }

  const zipFiles = {};

  for (const invoiceNumber of invoiceNumbers) {
    const safeInvoiceNumber = String(invoiceNumber).trim();

    if (!safeInvoiceNumber.startsWith("INV-MYONS-")) {
      continue;
    }

    const pdfKey = `invoices/${safeInvoiceNumber}.pdf`;
    const pdfObject = await env.INVOICES.get(pdfKey);

    if (!pdfObject) {
      continue;
    }

    const pdfBuffer = await pdfObject.arrayBuffer();

    zipFiles[`${safeInvoiceNumber}.pdf`] =
      new Uint8Array(pdfBuffer);
  }

  const zipBuffer = zipSync(zipFiles, {
    level: 0
  });

  return new Response(zipBuffer, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="myon-invoices.zip"`
    }
  });
}
