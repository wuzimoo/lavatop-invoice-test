import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const LAVA_API_BASE = process.env.LAVA_API_BASE || "https://gate.lava.top";
const webhookEvents = [];
const MAX_WEBHOOK_EVENTS = 50;

const indexFile = path.join(rootDir, "index.html");
const scriptFile = path.join(rootDir, "script.js");
const stylesFile = path.join(rootDir, "styles.css");

app.use(express.json({ limit: "1mb" }));

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function trimOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireWebhookAuth(req, res) {
  const expectedApiKey = trimOrNull(process.env.LAVA_WEBHOOK_API_KEY);
  const expectedBasicUser = trimOrNull(process.env.LAVA_WEBHOOK_BASIC_USER);
  const expectedBasicPass = trimOrNull(process.env.LAVA_WEBHOOK_BASIC_PASS);

  const hasWebhookAuthConfig =
    Boolean(expectedApiKey) || (Boolean(expectedBasicUser) && Boolean(expectedBasicPass));

  if (!hasWebhookAuthConfig) {
    return true;
  }

  const incomingApiKey = trimOrNull(req.header("x-api-key"));
  if (expectedApiKey && incomingApiKey === expectedApiKey) {
    return true;
  }

  const authorization = req.header("authorization") || "";
  if (expectedBasicUser && expectedBasicPass && authorization.startsWith("Basic ")) {
    try {
      const encodedPart = authorization.slice("Basic ".length);
      const decoded = Buffer.from(encodedPart, "base64").toString("utf8");
      const delimiterIndex = decoded.indexOf(":");
      if (delimiterIndex > -1) {
        const username = decoded.slice(0, delimiterIndex);
        const password = decoded.slice(delimiterIndex + 1);
        if (username === expectedBasicUser && password === expectedBasicPass) {
          return true;
        }
      }
    } catch {
      // Ignore decoding errors and continue to unauthorized response.
    }
  }

  res.status(401).json({
    error: "Unauthorized webhook",
    message:
      "Configure matching webhook auth in Lava and this app (X-Api-Key or Basic auth).",
  });
  return false;
}

function storeWebhookEvent(payload, headers = {}) {
  const item = {
    receivedAt: new Date().toISOString(),
    headers: {
      "x-api-key": headers["x-api-key"] || null,
      "user-agent": headers["user-agent"] || null,
    },
    payload,
  };

  webhookEvents.unshift(item);
  if (webhookEvents.length > MAX_WEBHOOK_EVENTS) {
    webhookEvents.length = MAX_WEBHOOK_EVENTS;
  }

  console.log("[lava-webhook]", JSON.stringify(item, null, 2));
  return item;
}

function webhookHandler(req, res) {
  if (!requireWebhookAuth(req, res)) {
    return;
  }

  const saved = storeWebhookEvent(req.body, req.headers);
  res.status(200).json({ ok: true, receivedAt: saved.receivedAt });
}

app.get("/", (_req, res) => {
  res.sendFile(indexFile);
});

app.get("/script.js", (_req, res) => {
  res.sendFile(scriptFile);
});

app.get("/styles.css", (_req, res) => {
  res.sendFile(stylesFile);
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    lavaApiBase: LAVA_API_BASE,
    hasLavaApiKey: Boolean(trimOrNull(process.env.LAVA_API_KEY)),
    webhookAuthConfigured:
      Boolean(trimOrNull(process.env.LAVA_WEBHOOK_API_KEY)) ||
      (Boolean(trimOrNull(process.env.LAVA_WEBHOOK_BASIC_USER)) &&
        Boolean(trimOrNull(process.env.LAVA_WEBHOOK_BASIC_PASS))),
  });
});

app.post("/api/checkout/create-subscription", async (req, res) => {
  const lavaApiKey = trimOrNull(process.env.LAVA_API_KEY);
  if (!lavaApiKey) {
    res.status(500).json({
      error: "Missing LAVA_API_KEY",
      message: "Set LAVA_API_KEY in environment variables before creating an invoice",
    });
    return;
  }

  const body = req.body || {};
  const email = trimOrNull(body.email);
  const offerId = trimOrNull(body.offerId);
  const currency = trimOrNull(body.currency) || "USD";
  const periodicity = trimOrNull(body.periodicity) || "MONTHLY";
  const buyerLanguage = trimOrNull(body.buyerLanguage) || "EN";
  const paymentProvider = trimOrNull(body.paymentProvider);
  const paymentMethod = trimOrNull(body.paymentMethod);

  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (!offerId) {
    res.status(400).json({ error: "offerId is required" });
    return;
  }

  const payload = {
    email,
    offerId,
    currency,
    periodicity,
    buyerLanguage,
  };

  if (paymentProvider) payload.paymentProvider = paymentProvider;
  if (paymentMethod) payload.paymentMethod = paymentMethod;

  try {
    const lavaResponse = await fetch(`${LAVA_API_BASE}/api/v3/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": lavaApiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await lavaResponse.text();
    let data;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { raw: rawText };
    }

    if (!lavaResponse.ok) {
      res.status(lavaResponse.status).json({
        error: "Lava invoice creation failed",
        requestPayload: payload,
        lavaResponse: data,
      });
      return;
    }

    res.json({
      ok: true,
      requestPayload: payload,
      checkout: {
        contractId: data?.id || null,
        status: data?.status || null,
        paymentUrl: data?.paymentUrl || null,
      },
      lavaResponse: data,
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to reach Lava API",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/webhooks/lava", webhookHandler);
app.post("/webhooks/lava", webhookHandler);

app.get("/api/webhooks/recent", (_req, res) => {
  res.json({ ok: true, total: webhookEvents.length, items: webhookEvents });
});

app.post("/api/webhooks/test", (_req, res) => {
  const payload = {
    eventType: "payment.success",
    product: {
      id: "72d53efb-3696-469f-b856-f0d815748dd6",
      title: "Test subscription",
    },
    buyer: {
      email: "test-buyer@example.com",
    },
    contractId: randomUUID(),
    amount: 19.99,
    currency: "USD",
    timestamp: new Date().toISOString(),
    status: "subscription-active",
    errorMessage: "",
  };

  const saved = storeWebhookEvent(payload, { "user-agent": "local-test" });
  res.json({ ok: true, event: saved });
});

app.get("/api/*", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.get("*", (_req, res) => {
  res.sendFile(indexFile);
});

export default app;
