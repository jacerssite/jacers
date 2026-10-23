# Future online payments

This project does not currently accept payments. When adding them, use a payment provider's hosted checkout page first; Stripe Checkout is a suitable starting option because the provider collects card details instead of this game server handling them.[^1]

## Owner-panel starting point

When implementation begins, add a new owner-only **Payments** section to the existing Control center. Start it as a dashboard that shows whether payments are configured, test/live mode, recent successful payments, pending fulfillment failures, and a link to the payment provider dashboard. Keep the actual secret keys in environment variables; the panel should only display configuration status, never the keys themselves.

## Recommended flow

1. Define each purchasable item on the server, with a stable ID, price, currency, and the in-game reward it grants. Do not accept a price or reward amount from the browser.
2. A signed-in player selects an item. `POST /api/payments/checkout` validates the item ID and creates a fresh provider checkout session for that account.
3. The browser redirects the player to the provider's hosted payment page.
4. The provider sends a signed webhook to `POST /api/payments/webhook` after payment succeeds. Verify its signature against the unmodified request body before trusting it.
5. The webhook records the provider payment ID in MongoDB with a unique index, then grants the reward in the same database transaction. A repeated webhook must find the existing payment and do nothing.
6. The browser returns to a success page and refreshes the player profile. The return page is informational only; it must never grant the reward itself.

## Records to store

Create a `payments` collection with one document per successful payment:

```js
{
  provider: "stripe",
  providerPaymentId: "...", // unique
  providerCheckoutSessionId: "...", // unique when present
  userId: ObjectId("..."),
  productId: "claims-pack-small",
  amount: 499, // smallest currency unit, e.g. 499 cents = $4.99 USD
  currency: "usd",
  status: "paid",
  fulfilledAt: new Date(),
  createdAt: new Date()
}
```

Also keep the reward operation auditable: store the payment ID in the player-progress update or in a separate `payment_fulfillments` collection with a unique `providerPaymentId` index.

## Environment variables

Keep provider secrets only in `.env` locally and in the host's private environment settings:

```env
PAYMENT_PROVIDER_SECRET_KEY=
PAYMENT_WEBHOOK_SECRET=
PAYMENT_SUCCESS_URL=https://your-domain.example/payments/success
PAYMENT_CANCEL_URL=https://your-domain.example/payments/cancel
```

Never put a secret key, webhook secret, card number, CVC, or raw payment details in frontend code, Git, logs, MongoDB, or error responses. A publishable browser key, if the provider uses one, is not a substitute for server-side verification.

## Implementation checklist

- Install the provider's official Node SDK and pin a supported API version.
- Add rate limiting and `requireUser` to checkout creation.
- Validate the webhook signature before parsing or using its event data; configure Express to preserve the raw body for this one route.
- Use the payment ID as an idempotency key, so duplicate delivery cannot give duplicate currency or items.
- Use server-side product IDs and integer minor units for amounts; never trust client-supplied dollars, cents, or item quantities.
- Check legal, tax, refund, age, and platform requirements for the places where the game is offered before enabling purchases.
- Test success, cancellation, declined payments, delayed payments, duplicate webhooks, and a webhook delivered before the player returns to the game.
- Add an owner-only refund/reconciliation view before launch. A refund should revoke a reward only through an explicit, logged decision.

[^1]: **How it works:** the game asks its own server to create a one-time checkout link. The player pays on the payment provider's page. The provider then calls the server directly with a signed confirmation. Only that server-to-server confirmation grants the in-game item, so closing or refreshing the success page cannot fake a purchase. See Stripe's [Checkout quickstart](https://docs.stripe.com/payments/checkout/quickstarts) and its guidance to fulfill purchases from [webhook events](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted), rather than from the browser redirect.
