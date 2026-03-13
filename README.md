# Lava Checkout 1-Page Demo

Single-page checkout with a subscription-style pay button, integrated with Lava invoice API and a webhook receiver for tests.
UI is simplified for mobile MVP: email + provider + one `Pay Monthly` button.

## What this uses from Lava docs

- `POST /api/v3/invoice` to create checkout invoice and get `paymentUrl`.
- `X-Api-Key` header for API auth.
- Webhook payload format from `PurchaseWebhookLog` examples.
- Webhook auth options from docs: `X-Api-Key` or Basic auth.

Docs used: `https://gate.lava.top/docs`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from example and set `LAVA_API_KEY`:

```bash
cp .env.example .env
```

Required variables:
- `LAVA_API_KEY`
- `LAVA_OFFER_ID` (your monthly offer id in Lava)

3. Start app:

```bash
npm run dev
```

4. Open:

- `http://localhost:3000`

## Checkout flow

1. Enter buyer email.
2. Select payment provider (or leave Auto).
3. Click **Pay Monthly**.
4. App calls your backend endpoint `/api/checkout/create-subscription`.
5. Backend calls Lava `POST https://gate.lava.top/api/v3/invoice` with fixed periodicity `MONTHLY` and returns `paymentUrl`.
6. Browser redirects to Lava checkout widget.

## Webhook test flow

- Webhook receiver URL in this app: `http://localhost:3000/api/webhooks/lava`
- For local-only quick validation, click **Send local test webhook**.
- To receive real Lava webhooks, expose local app publicly (for example with ngrok) and configure that public URL in Lava side.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel project settings, set environment variables:
   - `LAVA_API_KEY`
   - `LAVA_OFFER_ID`
   - `LAVA_API_BASE` (optional, default `https://gate.lava.top`)
   - `LAVA_DEFAULT_CURRENCY` (optional, default `USD`)
   - `LAVA_WEBHOOK_API_KEY` (optional)
   - `LAVA_WEBHOOK_BASIC_USER` / `LAVA_WEBHOOK_BASIC_PASS` (optional)
3. In Vercel, disable deployment protection for testing/webhooks:
   - `Project -> Settings -> Deployment Protection`
   - Turn off `Vercel Authentication` / Password protection for this deployment
4. Trigger deployment (or wait for auto-deploy on push).
5. Use webhook URL in Lava settings:
   - `https://<your-project>.vercel.app/api/webhooks/lava`

### If API returns HTML/404 instead of JSON on Vercel

- Disable `Deployment Protection` (Vercel Authentication / Password).
- Verify `Root Directory` points to repo root where `api/` folder exists.
- Clear custom `Output Directory` if set (it can disable serverless `api/*` routes).

## Security note

Do not expose your Lava API key in frontend code. This app keeps it server-side in `.env`.
