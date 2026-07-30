// netlify/functions/report-dose.js
//
// Called by the client every time a dose is marked "pris" or "attente".
// Merges the status into the device's stored entry so send-reminders.js
// can tell whether a scheduled dose was actually taken before sending a
// "missed dose" follow-up alert.

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

  const { deviceId, date, treatmentId, time, status } = payload;
  if (!deviceId || !date || !treatmentId || !time || !status) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  try {
    const store = getStore("push-subscriptions");
    const entry = await store.get(deviceId, { type: "json" });
    if (!entry) {
      // No push subscription yet for this device — nothing to attach the log to.
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, noop: true }) };
    }

    entry.doseLog = entry.doseLog || {};
    const logKey = `${date}__${treatmentId}__${time}`;
    entry.doseLog[logKey] = status;

    // Keep only the last ~3 days of dose log entries to avoid unbounded growth.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    Object.keys(entry.doseLog).forEach((k) => {
      const datePart = k.split("__")[0];
      if (datePart < cutoffStr) delete entry.doseLog[k];
    });

    await store.setJSON(deviceId, entry);

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("report-dose error:", err);
    return { statusCode: 500, body: "Storage error" };
  }
};
