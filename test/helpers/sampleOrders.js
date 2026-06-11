export function createPaidShopifyOrder(overrides = {}) {
  return {
    id: 12793278628171,
    name: "#1086",
    order_number: 1086,
    financial_status: "paid",
    test: false,
    email: "karinawagner7@web.de",
    contact_email: "karinawagner7@web.de",
    created_at: "2026-06-04T10:36:23+02:00",
    processed_at: "2026-06-04T10:36:23+02:00",
    currency: "EUR",
    total_price: "29.99",
    total_tax: "4.79",
    total_outstanding: "0.00",
    payment_gateway_names: ["PayPal Express Checkout"],
    billing_address: {
      name: "Karina Wagner",
      address1: "Benneckenrode 32",
      address2: "",
      company: "",
      city: "Thale",
      zip: "06502",
      country_code: "DE",
      country: "Germany"
    },
    customer: {
      first_name: "Karina",
      last_name: "Wagner",
      email: "karinawagner7@web.de"
    },
    line_items: [
      {
        title: "Digitale Begleitung von Dr. Franziska Rubin",
        name: "Digitale Begleitung von Dr. Franziska Rubin",
        quantity: 1,
        price: "29.99",
        tax_lines: [
          {
            title: "DE MwSt 19%",
            rate: 0.19,
            price: "4.79"
          }
        ]
      }
    ],
    ...overrides
  };
}

export function createMalformedTaxOrder() {
  return createPaidShopifyOrder({
    line_items: [
      {
        title: "Test Product",
        quantity: 1,
        price: "10.00",
        tax_lines: null
      }
    ]
  });
}

export function createEmptyLineItemsOrder() {
  return createPaidShopifyOrder({
    line_items: []
  });
}