const checkoutForm = document.getElementById("checkout-form");
const payBtn = document.getElementById("pay-btn");
const checkoutResult = document.getElementById("checkout-result");
const webhookUrlEl = document.getElementById("webhook-url");
const testWebhookBtn = document.getElementById("test-webhook-btn");
const refreshWebhooksBtn = document.getElementById("refresh-webhooks-btn");
const webhookEventsEl = document.getElementById("webhook-events");

webhookUrlEl.textContent = `${window.location.origin}/api/webhooks/lava`;

function setResult(message, type = "") {
  checkoutResult.textContent = message;
  checkoutResult.className = `result ${type}`.trim();
}

function valueOrNull(id) {
  const value = document.getElementById(id).value.trim();
  return value.length > 0 ? value : null;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return { raw, json: JSON.parse(raw), isJson: true };
    } catch {
      return { raw, json: null, isJson: false };
    }
  }

  try {
    return { raw, json: JSON.parse(raw), isJson: true };
  } catch {
    return { raw, json: null, isJson: false };
  }
}

function isVercelAuthHtml(text) {
  return typeof text === "string" && text.includes("Vercel Authentication");
}

function isVercelNotFoundHtml(text) {
  if (typeof text !== "string") return false;
  return text.includes("The page could not be found") || text.includes("404: NOT_FOUND");
}

async function refreshWebhookEvents() {
  webhookEventsEl.textContent = "Loading webhook events...";

  try {
    const response = await fetch("/api/webhooks/recent", { credentials: "same-origin" });
    const parsed = await parseResponse(response);

    if (!parsed.isJson) {
      if (isVercelAuthHtml(parsed.raw)) {
        webhookEventsEl.textContent =
          "Vercel Deployment Protection is enabled. Disable Vercel Authentication / Password Protection for this deployment to allow API + webhook JSON responses.";
        return;
      }

      if (isVercelNotFoundHtml(parsed.raw)) {
        webhookEventsEl.textContent =
          "Vercel API route not found (404). Check project settings: Root Directory must point to this repo root, and clear custom Output Directory/Build settings that disable /api functions.";
        return;
      }

      webhookEventsEl.textContent = `Unexpected non-JSON response (HTTP ${response.status}).`;
      return;
    }

    const data = parsed.json;
    if (!response.ok) {
      webhookEventsEl.textContent = JSON.stringify(data, null, 2);
      return;
    }

    if (!data.items || data.items.length === 0) {
      webhookEventsEl.textContent = "No webhook events yet.";
      return;
    }

    webhookEventsEl.textContent = JSON.stringify(data.items, null, 2);
  } catch (error) {
    webhookEventsEl.textContent = `Failed to load webhook events: ${error.message}`;
  }
}

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  payBtn.disabled = true;
  setResult("Creating monthly checkout...");

  try {
    const payload = {
      email: valueOrNull("email"),
      paymentProvider: valueOrNull("paymentProvider"),
      periodicity: "MONTHLY",
      buyerLanguage: "EN",
    };

    const response = await fetch("/api/checkout/create-subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const parsed = await parseResponse(response);

    if (!parsed.isJson) {
      if (isVercelAuthHtml(parsed.raw)) {
        setResult(
          "Vercel Deployment Protection is enabled. Disable protection for this project so checkout API can return JSON.",
          "error",
        );
        return;
      }

      if (isVercelNotFoundHtml(parsed.raw)) {
        setResult(
          "API route not found on Vercel (404). Check Vercel project Root Directory and remove custom Output Directory/Build settings.",
          "error",
        );
        return;
      }

      setResult(`Unexpected non-JSON response (HTTP ${response.status}).`, "error");
      return;
    }

    const data = parsed.json;
    if (!response.ok) {
      const message = data?.error || "Checkout creation failed";
      setResult(message, "error");
      console.error("Lava checkout error:", data);
      return;
    }

    const paymentUrl = data?.checkout?.paymentUrl;
    const contractId = data?.checkout?.contractId || "n/a";

    if (!paymentUrl) {
      setResult(`Invoice created (${contractId}) but payment URL is empty.`, "error");
      console.log("Lava response", data);
      return;
    }

    setResult(`Invoice ready. Redirecting to payment...`, "success");
    window.location.href = paymentUrl;
  } catch (error) {
    setResult(`Unexpected error: ${error.message}`, "error");
  } finally {
    payBtn.disabled = false;
  }
});

testWebhookBtn.addEventListener("click", async () => {
  testWebhookBtn.disabled = true;

  try {
    const response = await fetch("/api/webhooks/test", { method: "POST", credentials: "same-origin" });
    const parsed = await parseResponse(response);

    if (!parsed.isJson) {
      if (isVercelAuthHtml(parsed.raw)) {
        alert("Vercel protection blocks /api/webhooks/test. Disable deployment protection.");
        return;
      }

      if (isVercelNotFoundHtml(parsed.raw)) {
        alert("API route not found on Vercel (404). Check project Root Directory and Output Directory settings.");
        return;
      }

      alert(`Test webhook failed with non-JSON response (HTTP ${response.status})`);
      return;
    }

    if (!response.ok) {
      alert(`Failed to send test webhook: ${JSON.stringify(parsed.json)}`);
      return;
    }

    const event = parsed.json?.event;
    if (event) {
      webhookEventsEl.textContent = JSON.stringify(
        {
          note: "Latest test event (rendered from immediate response).",
          event,
        },
        null,
        2,
      );
    } else {
      await refreshWebhookEvents();
    }
  } catch (error) {
    alert(`Failed to send test webhook: ${error.message}`);
  } finally {
    testWebhookBtn.disabled = false;
  }
});

refreshWebhooksBtn.addEventListener("click", refreshWebhookEvents);
refreshWebhookEvents();
