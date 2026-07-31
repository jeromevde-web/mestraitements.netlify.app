// netlify/functions/save-subscription.js
//
// Stores (or updates) a device's push subscription together with its
// timezone, a schedule of { time: "HH:MM", medications: [names] }, and
// current stock levels per treatment. Merges into any existing entry so
// the dose log and low-stock notification flags aren't lost.
// Keyed by a random deviceId generated client-side and kept in localStorage.

const { getStore } = require("./_blobs-helper.js");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { deviceId, subscription, timezone, schedule, stockInfo } = payload;

  if (!deviceId || !subscription || !timezone || !Array.isArray(schedule)) {
    return { statusCode: 400, body: "Missing deviceId, subscription, timezone, or schedule" };
  }

  try {
    const store = getStore("push-subscriptions");
    const existing = (await store.get(deviceId, { type: "json" })) || {};

    await store.setJSON(deviceId, {
      ...existing,
      subscription,
      timezone,
      schedule, // e.g. [{ time: "08:00", medications: [{id, name}] }]
      stockInfo: Array.isArray(stockInfo) ? stockInfo : existing.stockInfo || [],
      doseLog: existing.doseLog || {},
      lowStockNotified: existing.lowStockNotified || {},
      updatedAt: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("save-subscription error:", err);
    return { statusCode: 500, body: "Storage error" };
  }
};

