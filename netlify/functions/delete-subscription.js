// netlify/functions/delete-subscription.js
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

  const { deviceId } = payload;
  if (!deviceId) {
    return { statusCode: 400, body: "Missing deviceId" };
  }

  try {
    const store = getStore("push-subscriptions");
    await store.delete(deviceId);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("delete-subscription error:", err);
    return { statusCode: 500, body: "Storage error" };
  }
};
