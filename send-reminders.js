// netlify/functions/send-reminders.js
//
// Runs every minute (see netlify.toml schedule). For every stored device
// subscription, computes that device's current local time (using its saved
// IANA timezone, so it stays correct across DST changes) and sends a real
// push notification if a scheduled dose time matches the current minute.

const webpush = require("web-push");
const { getStore } = require("@netlify/blobs");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || "mailto:contact@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function currentLocalHHMM(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // en-GB gives "HH:MM" already in 24h format
    return formatter.format(now);
  } catch (e) {
    // fallback to UTC if timezone string is invalid
    const now = new Date();
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  }
}

exports.handler = async () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("VAPID keys are not configured as environment variables.");
    return { statusCode: 500, body: "VAPID keys missing" };
  }

  const store = getStore("push-subscriptions");
  let sent = 0;
  let removed = 0;
  let checked = 0;

  try {
    const { blobs } = await store.list();

    for (const { key } of blobs) {
      checked++;
      let entry;
      try {
        entry = await store.get(key, { type: "json" });
      } catch (e) {
        continue;
      }
      if (!entry || !entry.subscription || !entry.schedule || !entry.timezone) continue;

      const nowHHMM = currentLocalHHMM(entry.timezone);
      const slot = entry.schedule.find((s) => s.time === nowHHMM);
      if (!slot) continue;

      const meds = slot.medications || [];
      const body =
        meds.length === 1
          ? `C'est l'heure : ${meds[0]}`
          : meds.length > 1
          ? `C'est l'heure : ${meds.join(", ")}`
          : "C'est l'heure de votre prise.";

      const payload = JSON.stringify({
        title: "MesTraitements",
        body,
      });

      try {
        await webpush.sendNotification(entry.subscription, payload);
        sent++;
      } catch (err) {
        // 404/410 means the subscription is no longer valid (browser data cleared, etc.)
        if (err.statusCode === 404 || err.statusCode === 410) {
          await store.delete(key);
          removed++;
        } else {
          console.error("Push send error for", key, err.statusCode, err.body);
        }
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked, sent, removed }),
    };
  } catch (err) {
    console.error("send-reminders fatal error:", err);
    return { statusCode: 500, body: "Internal error" };
  }
};
