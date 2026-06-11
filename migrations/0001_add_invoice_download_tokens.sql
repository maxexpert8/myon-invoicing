ALTER TABLE invoice_registry ADD COLUMN download_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_registry_download_token
ON invoice_registry(download_token);

UPDATE invoice_registry
SET download_token = lower(hex(randomblob(32)))
WHERE download_token IS NULL OR download_token = '';
