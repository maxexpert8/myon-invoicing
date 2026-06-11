ALTER TABLE invoice_registry ADD COLUMN pdf_key TEXT;

UPDATE invoice_registry
SET pdf_key = pdf_url
WHERE (pdf_key IS NULL OR pdf_key = '')
  AND pdf_url IS NOT NULL
  AND pdf_url != '';

CREATE INDEX IF NOT EXISTS idx_invoice_registry_pdf_key
ON invoice_registry(pdf_key);
