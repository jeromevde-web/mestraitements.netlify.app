// netlify/functions/save-subscription.js
//
// Stores (or updates) a device's push subscription together with its
// timezone and a schedule of { time: "HH:MM", medications: [names] }.
// Keyed by a random deviceId generated client-side and kept in localStorage.

const { getStore } = require("@netlify/blobs");

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

  const { deviceId, subscription, timezone, schedule } = payload;

  if (!deviceId || !subscription || !timezone || !Array.isArray(schedule)) {
    return { statusCode: 400, body: "Missing deviceId, subscription, timezone, or schedule" };
  }

  try {
    const store = getStore("push-subscriptions");
    await store.setJSON(deviceId, {
      subscription,
      timezone,
      schedule, // e.g. [{ time: "08:00", medications: ["Doliprane 500mg"] }]
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

