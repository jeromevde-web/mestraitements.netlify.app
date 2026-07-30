// netlify/functions/_blobs-helper.js
//
// Wraps @netlify/blobs' getStore so it works whether or not Netlify's
// automatic Blobs context is available in this deployment. If the
// automatic context is missing (MissingBlobsEnvironmentError), it falls
// back to explicit configuration using BLOBS_SITE_ID and BLOBS_TOKEN
// environment variables (a Site ID + a Personal Access Token).

const { getStore: nativeGetStore } = require("@netlify/blobs");

function getStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;

  if (siteID && token) {
    return nativeGetStore({ name, siteID, token });
  }

  // Try automatic context first (works on standard Netlify deployments).
  return nativeGetStore(name);
}

module.exports = { getStore };
