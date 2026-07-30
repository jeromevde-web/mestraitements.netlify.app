// netlify/functions/send-reminders.js
//
// Runs every minute (see netlify.toml schedule). For every stored device
// subscription, computes that device's current local time (using its saved
// IANA timezone, so it stays correct across DST changes) and:
//  1. Sends the on-time reminder when a scheduled dose time matches now.
//  2. Sends a follow-up "missed dose" alert 30 minutes later, but only for
//     medications that are still not marked as taken (checked against the
//     doseLog synced from the client via report-dose.js).

const webpush = require("web-push");
const { getStore } = require("@netlify/blobs");

const MISSED_GRACE_MINUTES = 30;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || "mailto:contact@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function localParts(timezone) {
  try {
    const now = new Date();
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }); // YYYY-MM-DD
    return { hhmm: timeFmt.format(now), date: dateFmt.format(now) };
  } catch (e) {
    const now = new Date();
    return {
      hhmm: `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
      date: now.toISOString().slice(0, 10),
    };
  }
}

function subtractMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m - minutes;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

async function push(store, key, entry, payload) {
  try {
    await webpush.sendNotification(entry.subscription, JSON.stringify(payload));
    return "sent";
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await store.delete(key);
      return "removed";
    }
    console.error("Push send error for", key, err.statusCode, err.body);
    return "error";
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

      const { hhmm: nowHHMM, date: today } = localParts(entry.timezone);
      const doseLog = entry.doseLog || {};

      // 1. On-time reminder
      const onTimeSlot = entry.schedule.find((s) => s.time === nowHHMM);
      if (onTimeSlot) {
        const meds = onTimeSlot.medications || [];
        const names = meds.map((m) => (typeof m === "string" ? m : m.name));
        const body =
          names.length === 1
            ? `C'est l'heure : ${names[0]}`
            : names.length > 1
            ? `C'est l'heure : ${names.join(", ")}`
            : "C'est l'heure de votre prise.";
        const result = await push(store, key, entry, {
          title: "MesTraitements", body, tag: "mestraitements-ontime",
        });
        if (result === "sent") sent++;
        if (result === "removed") { removed++; continue; }
      }

      // 2. Missed-dose follow-up (grace period after scheduled time)
      const missedCheckTarget = subtractMinutes(nowHHMM, MISSED_GRACE_MINUTES);
      const missedSlot = entry.schedule.find((s) => s.time === missedCheckTarget);
      if (missedSlot) {
        const meds = missedSlot.medications || [];
        const stillMissing = meds.filter((m) => {
          if (typeof m === "string") return true; // no id available, can't verify -> assume missed
          const logKey = `${today}__${m.id}__${missedSlot.time}`;
          return doseLog[logKey] !== "pris";
        });
        const names = stillMissing.map((m) => (typeof m === "string" ? m : m.name));
        if (names.length > 0) {
          const body =
            names.length === 1
              ? `Non prise : ${names[0]} (prévu à ${missedSlot.time})`
              : `Non prises : ${names.join(", ")} (prévu à ${missedSlot.time})`;
          const result = await push(store, key, entry, {
            title: "⚠️ MesTraitements", body, tag: "mestraitements-missed",
          });
          if (result === "sent") sent++;
          if (result === "removed") removed++;
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

