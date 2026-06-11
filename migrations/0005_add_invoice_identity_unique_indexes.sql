CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_registry_shopify_order_number_unique
ON invoice_registry(shopify_order_number)
WHERE shopify_order_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_registry_shopify_order_id_unique
ON invoice_registry(shopify_order_id)
WHERE shopify_order_id IS NOT NULL
  AND shopify_order_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_registry_invoice_number_unique
ON invoice_registry(invoice_number)
WHERE invoice_number IS NOT NULL
  AND invoice_number != '';
