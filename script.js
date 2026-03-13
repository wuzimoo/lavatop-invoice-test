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

async function refreshWebhookEvents() {
  webhookEventsEl.textContent = "Loading webhook events...";

  try {
    const response = await fetch("/api/webhooks/recent");
    const data = await response.json();

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
  setResult("Creating Lava checkout...");

  try {
    const payload = {
      email: valueOrNull("email"),
      offerId: valueOrNull("offerId"),
      currency: valueOrNull("currency") || "USD",
      periodicity: valueOrNull("periodicity") || "MONTHLY",
      paymentProvider: valueOrNull("paymentProvider"),
      paymentMethod: valueOrNull("paymentMethod"),
      buyerLanguage: "EN",
    };

    const response = await fetch("/api/checkout/create-subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error || "Checkout creation failed";
      setResult(`${message}. See console for details.`, "error");
      console.error("Lava checkout error:", data);
      return;
    }

    const paymentUrl = data?.checkout?.paymentUrl;
    const contractId = data?.checkout?.contractId || "n/a";

    if (!paymentUrl) {
      setResult(`Invoice created (contract ${contractId}) but no payment URL returned.`, "error");
      console.log("Lava response", data);
      return;
    }

    setResult(`Invoice created (${contractId}). Redirecting to Lava payment page...`, "success");
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
    const response = await fetch("/api/webhooks/test", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      alert(`Failed to send test webhook: ${JSON.stringify(data)}`);
      return;
    }

    await refreshWebhookEvents();
  } catch (error) {
    alert(`Failed to send test webhook: ${error.message}`);
  } finally {
    testWebhookBtn.disabled = false;
  }
});

refreshWebhooksBtn.addEventListener("click", refreshWebhookEvents);
refreshWebhookEvents();
