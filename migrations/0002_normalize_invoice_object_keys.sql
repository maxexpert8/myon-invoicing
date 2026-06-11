UPDATE invoice_registry
SET pdf_url = substr(pdf_url, instr(pdf_url, 'invoices/'))
WHERE pdf_url LIKE 'http%/invoices/%';
