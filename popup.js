// popup.js

let countdownTimer = null;
let baseVersionText = ""; // will be filled after an update check

// Pending action for the domain lookup feature (block / unblock a domain)
let pendingDomainAction = null; // { mode: "block" | "unblock", domain }

// Builds an API URL with properly URL-encoded query parameters.
function apiUrl(server, path, params = {}) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      usp.append(key, String(value));
    }
  }
  return `${server}${path}?${usp.toString()}`;
}

// Help function: Stop countdown and clean up storage if necessary
function stopCountdown(clearStorage = false) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  const countdownEl = document.getElementById("countdown");
  if (countdownEl) {
    countdownEl.textContent = "";
  }
  if (clearStorage && chrome?.storage?.local) {
    chrome.storage.local.remove("temporaryDisableUntil");
  }
}

// Loads saved settings (server & API key)
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["server", "apiKey", "temporaryDisableUntil"], (result) => {
      resolve(result);
    });
  });
}

// Retrieves the current blocking status via /api/settings/get and updates the UI
async function checkBlockingStatus() {
  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) {
    document.getElementById("blockingStatus").textContent = "No settings available.";
    return;
  }
  try {
    const response = await fetch(apiUrl(server, "/api/settings/get", { token: apiKey }), { mode: "cors" });
    if (!response.ok) {
      document.getElementById("blockingStatus").textContent =
        `Error retrieving status (HTTP ${response.status}).`;
      return;
    }

    const data = await response.json();
    console.log("API response (settings/get):", data);

    const settings = data.response || data;
    const isBlockingEnabled =
      settings && typeof settings.enableBlocking !== "undefined"
        ? settings.enableBlocking
        : false;

    updateBlockingUI(isBlockingEnabled);
    updateExtensionIcon(isBlockingEnabled);
    updateLogo(isBlockingEnabled);
  } catch (error) {
    console.error("Error retrieving status:", error.message);
    document.getElementById("blockingStatus").textContent = "Error retrieving status.";
  }
}

// Updates UI elements (status text and toggle switch) based on the blocking status
function updateBlockingUI(isBlockingEnabled) {
  const toggleSwitch = document.getElementById("toggleSwitch");
  toggleSwitch.checked = isBlockingEnabled;
  document.getElementById("blockingStatus").textContent = isBlockingEnabled
    ? "Blocking is enabled."
    : "Blocking is disabled.";
}

// Updates the extension icon in the Chrome toolbar based on the status
function updateExtensionIcon(isBlockingEnabled) {
  const iconPath = isBlockingEnabled ? "icon_green.png" : "icon_red.png";
  if (chrome.action && chrome.action.setIcon) {
    chrome.action.setIcon({ path: iconPath });
  }
}

// Updates the logo image in the popup based on the status
function updateLogo(isBlockingEnabled) {
  const logo = document.getElementById("logo");
  logo.src = isBlockingEnabled ? "icon_green.png" : "icon_red.png";
}

// Toggles the permanent blocking status via the API call
async function toggleBlockingPermanent(enable) {
  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) return;

  // Wenn man Blocking manuell auf Enabled setzt → Countdown sofort stoppen
  if (enable) {
    stopCountdown(true); // Timer + Storage aufräumen
  }

  try {
    const url = apiUrl(server, "/api/settings/set", { token: apiKey, enableBlocking: enable });
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      alert(`Error switching: HTTP ${response.status}`);
    }
    // Re-check status after toggling
    checkBlockingStatus();
  } catch (error) {
    console.error("Error switching:", error.message);
  }
}

// starts or updates the countdown for temporary blocking
function startCountdown(isoString) {
  const countdownEl = document.getElementById("countdown");

  // Always exit previous timer
  stopCountdown(false);

  if (!isoString) {
    return;
  }

  const until = new Date(isoString);

  function update() {
    const now = new Date();
    const diffMs = until - now;
    if (diffMs <= 0) {
      stopCountdown(true); // Remove Timer + Storage
      // reload status, as blocking should be active again
      checkBlockingStatus();
      return;
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");

    countdownEl.textContent = `Blocking resumes in ${hours}:${minutes}:${seconds}`;
  }

  update();
  countdownTimer = setInterval(update, 1000);
}

// temporarily disables DNS blocking via the API call
async function temporaryDisable(minutes) {
  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) {
    alert("Please configure the server and token in settings first.");
    return;
  }
  try {
    const url = apiUrl(server, "/api/settings/temporaryDisableBlocking", { token: apiKey, minutes });
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      alert(`Error: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log("API response (temporaryDisableBlocking):", data);

    if (
      data.status === "ok" &&
      data.response &&
      data.response.temporaryDisableBlockingTill
    ) {
      const iso = data.response.temporaryDisableBlockingTill;
      chrome.storage.local.set({ temporaryDisableUntil: iso }, () => {
        startCountdown(iso);
      });
      alert(
        `DNS Blocking disabled for ${
          minutes === "1440" ? "24 Hours" : minutes + " Minute(s)"
        }.`
      );
    } else {
      alert("Temporary disable succeeded, but no expiry time returned.");
    }
  } catch (error) {
    alert("Error calling API: " + error.message);
  }
}

// ---------------------------------------------------------------------------
// Domain lookup feature: check whether a domain is currently blocked and where,
// then offer to block it (if not blocked) or allow it (if currently blocked).
// ---------------------------------------------------------------------------

// Normalizes user input into a bare domain name (strips scheme, path, port).
function normalizeDomain(raw) {
  if (!raw) return "";
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, ""); // strip scheme
  d = d.split("/")[0]; // strip path
  d = d.split("?")[0]; // strip query
  d = d.replace(/:\d+$/, ""); // strip port
  d = d.replace(/\.$/, ""); // strip trailing dot
  return d;
}

// Basic sanity check for a domain name.
function isValidDomain(d) {
  return /^(?=.{1,253}$)([a-z0-9_](-?[a-z0-9_])*\.)+[a-z]{2,}$/.test(d);
}

// Queries an allowed/blocked zone node for a domain. Returns true if the exact
// domain is present as a record in that zone. Detection is best-effort; the
// block/unblock actions do not rely on it (add/delete are idempotent).
async function isDomainInZone(server, apiKey, zone, domain) {
  try {
    const url = apiUrl(server, `/api/${zone}/list`, { token: apiKey, domain });
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.status !== "ok") return false;
    const resp = data.response || {};
    const records = resp.records || [];
    // A present entry has records whose name matches the queried domain.
    return records.some(
      (r) => (r.name || "").toLowerCase() === domain
    );
  } catch (e) {
    console.warn(`Zone check (${zone}) failed:`, e.message);
    return false;
  }
}

// Resolves a domain through the Technitium server itself so that blocking is
// applied, then interprets whether the answer is a sinkhole (i.e. blocked).
async function resolveThroughServer(server, apiKey, domain, sinkholeAddresses, blockingType) {
  const url = apiUrl(server, "/api/dnsClient/resolve", {
    token: apiKey,
    server: "this-server",
    domain,
    type: "A",
    protocol: "Udp",
  });

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    return { status: "error", detail: `HTTP ${response.status}` };
  }
  const data = await response.json();
  if (data.status !== "ok") {
    return { status: "error", detail: data.errorMessage || "API error" };
  }

  // The DNS message can be nested differently depending on the version.
  const result = data.response?.result || data.response || {};
  const answers = result.Answer || result.answer || [];
  const rcode = String(result.RCODE || result.rcode || "").toLowerCase();

  const sinkholes = new Set(
    ["0.0.0.0", "::", "127.0.0.1", ...(sinkholeAddresses || [])].map((s) =>
      String(s).toLowerCase()
    )
  );

  // Extract IP strings from answer records (handles a few RDATA shapes).
  const ips = answers
    .map((a) => {
      const rd = a.RDATA || a.rData || a.rdata;
      if (!rd) return null;
      if (typeof rd === "string") return rd;
      return rd.IPAddress || rd.ipAddress || rd.Address || rd.address || null;
    })
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  const hitSinkhole = ips.some((ip) => sinkholes.has(ip));
  if (hitSinkhole) {
    return { status: "blocked", detail: "sinkhole", source: extractBlockSource(data) };
  }

  // NXDOMAIN blocking type: an NXDOMAIN with no answers means blocked.
  if (
    (rcode === "nxdomain" || rcode === "namefail") &&
    String(blockingType || "").toLowerCase() === "nxdomain"
  ) {
    return { status: "blocked", detail: "nxdomain", source: extractBlockSource(data) };
  }

  if (ips.length > 0) {
    return { status: "allowed", detail: ips.join(", ") };
  }

  // No sinkhole, no answers, not an NXDOMAIN-block config → treat as not blocked.
  return { status: "allowed", detail: rcode || "no answer" };
}

// Best-effort extraction of the originating block list URL from the response.
function extractBlockSource(data) {
  try {
    const json = JSON.stringify(data);
    const match = json.match(/https?:\/\/[^\s"']+\.(?:txt|list|hosts)[^\s"']*/i);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

// Reads blocking-related settings needed to interpret the resolve answer.
async function getBlockingSettings(server, apiKey) {
  try {
    const response = await fetch(apiUrl(server, "/api/settings/get", { token: apiKey }), { mode: "cors" });
    if (!response.ok) return {};
    const data = await response.json();
    const s = data.response || data || {};
    return {
      blockingType: s.blockingType,
      customBlockingAddresses: s.customBlockingAddresses || [],
    };
  } catch {
    return {};
  }
}

// Main entry point: checks a domain and renders the result + an action button.
async function checkDomain() {
  const input = document.getElementById("domainInput");
  const resultEl = document.getElementById("domainResult");
  const actionBtn = document.getElementById("domainActionBtn");
  const checkBtn = document.getElementById("checkDomainBtn");

  actionBtn.style.display = "none";
  pendingDomainAction = null;

  const domain = normalizeDomain(input.value);
  input.value = domain;

  if (!domain) {
    resultEl.textContent = "Please enter a domain.";
    resultEl.className = "info-text";
    return;
  }
  if (!isValidDomain(domain)) {
    resultEl.textContent = "That does not look like a valid domain.";
    resultEl.className = "info-text";
    return;
  }

  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) {
    resultEl.textContent = "No settings available. Configure server and token first.";
    resultEl.className = "info-text";
    return;
  }

  resultEl.textContent = `Checking "${domain}"…`;
  resultEl.className = "info-text";
  checkBtn.disabled = true;

  try {
    const settings = await getBlockingSettings(server, apiKey);
    const [inAllowed, inBlocked, resolved] = await Promise.all([
      isDomainInZone(server, apiKey, "allowed", domain),
      isDomainInZone(server, apiKey, "blocked", domain),
      resolveThroughServer(
        server,
        apiKey,
        domain,
        settings.customBlockingAddresses,
        settings.blockingType
      ),
    ]);

    if (resolved.status === "error") {
      resultEl.textContent = `Could not resolve "${domain}" (${resolved.detail}).`;
      resultEl.className = "info-text";
      return;
    }

    const isBlocked = resolved.status === "blocked";

    // Build a human-readable "where" description.
    const where = [];
    if (inBlocked) where.push("Blocked Zone (manual)");
    if (isBlocked && !inBlocked) {
      where.push(resolved.source ? `block list: ${resolved.source}` : "an external block list");
    }
    if (inAllowed) where.push("Allowed Zone (whitelist)");

    if (isBlocked) {
      resultEl.innerHTML =
        `<strong>"${domain}" is BLOCKED.</strong><br>` +
        `Source: ${where.length ? where.join(", ") : "unknown"}`;
      resultEl.className = "info-text update-available";
      pendingDomainAction = { mode: "unblock", domain };
      actionBtn.textContent = `Allow "${domain}"`;
      actionBtn.className = "action-btn allow";
      actionBtn.style.display = "block";
    } else {
      const note = inAllowed
        ? " (explicitly whitelisted in the Allowed Zone)"
        : "";
      resultEl.innerHTML =
        `<strong>"${domain}" is NOT blocked${note}.</strong>` +
        (resolved.detail && resolved.status === "allowed"
          ? `<br>Resolves to: ${resolved.detail}`
          : "");
      resultEl.className = "info-text ok";
      pendingDomainAction = { mode: "block", domain };
      actionBtn.textContent = `Block "${domain}"`;
      actionBtn.className = "action-btn block";
      actionBtn.style.display = "block";
    }
  } catch (error) {
    console.error("Domain check failed:", error);
    resultEl.textContent = "Error checking domain: " + error.message;
    resultEl.className = "info-text";
  } finally {
    checkBtn.disabled = false;
  }
}

// Applies the pending block/unblock action.
async function applyDomainAction() {
  if (!pendingDomainAction) return;
  const { mode, domain } = pendingDomainAction;

  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) return;

  const actionBtn = document.getElementById("domainActionBtn");
  const resultEl = document.getElementById("domainResult");
  actionBtn.disabled = true;

  // Idempotent helper: fire a zone add/delete and ignore "not found" errors.
  async function zoneCall(zone, op) {
    try {
      const url = apiUrl(server, `/api/${zone}/${op}`, { token: apiKey, domain });
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === "ok";
    } catch (e) {
      console.warn(`${zone}/${op} failed:`, e.message);
      return false;
    }
  }

  try {
    let ok;
    if (mode === "block") {
      // Remove any whitelist override first, then add to the blocked zone.
      await zoneCall("allowed", "delete");
      ok = await zoneCall("blocked", "add");
      if (!ok) throw new Error("Server rejected the block request.");
      resultEl.textContent = `"${domain}" has been blocked.`;
    } else {
      // Remove from the blocked zone and add an allow override for block lists.
      await zoneCall("blocked", "delete");
      ok = await zoneCall("allowed", "add");
      if (!ok) throw new Error("Server rejected the allow request.");
      resultEl.textContent = `"${domain}" has been allowed.`;
    }
    resultEl.className = "info-text ok";

    // Refresh the verdict after a short delay so the server can apply changes.
    setTimeout(checkDomain, 400);
  } catch (error) {
    console.error("Domain action failed:", error);
    resultEl.textContent = "Action failed: " + error.message;
    resultEl.className = "info-text";
  } finally {
    actionBtn.disabled = false;
  }
}

// update-check via /api/user/checkForUpdate
async function checkForUpdateAndShow() {
  const updateInfoEl = document.getElementById("updateInfo");
  const button = document.getElementById("checkUpdateBtn");

  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) {
    updateInfoEl.textContent = "No settings available.";
    updateInfoEl.className = "info-text";
    return;
  }

  updateInfoEl.textContent = "Checking for update...";
  updateInfoEl.className = "info-text";
  button.disabled = true;

  try {
    const url = apiUrl(server, "/api/user/checkForUpdate", { token: apiKey });
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      updateInfoEl.textContent = `Update check failed (HTTP ${response.status})`;
      updateInfoEl.className = "info-text";
      return;
    }

    const data = await response.json();
    console.log("API response (checkForUpdate):", data);

    if (!data.response || data.status !== "ok") {
      updateInfoEl.textContent = "Update check failed (API error).";
      updateInfoEl.className = "info-text";
      return;
    }

    const info = data.response;
    baseVersionText = info.currentVersion
      ? `Version ${info.currentVersion}`
      : "Version unknown";

    if (info.updateAvailable) {
      updateInfoEl.textContent = `${baseVersionText} → ${info.updateVersion} available`;
      updateInfoEl.className = "info-text update-available";
    } else {
      updateInfoEl.textContent = `${baseVersionText} (up to date)`;
      updateInfoEl.className = "info-text ok";
    }
  } catch (err) {
    console.error("Update check failed:", err);
    updateInfoEl.textContent = "Update check failed.";
    updateInfoEl.className = "info-text";
  } finally {
    button.disabled = false;
  }
}

// event listeners after DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  const { temporaryDisableUntil } = await loadSettings();
  if (temporaryDisableUntil) {
    startCountdown(temporaryDisableUntil);
  }

  checkBlockingStatus();

  // toggle switch event: changes permanent blocking status
  document.getElementById("toggleSwitch").addEventListener("change", (e) => {
    toggleBlockingPermanent(e.target.checked);
  });

  // dropdown event for temporary disable
  document.getElementById("tempDuration").addEventListener("change", (e) => {
    const minutes = e.target.value;
    if (
      confirm(
        `Do you want to temporarily disable DNS Blocking for ${
          minutes === "1440" ? "24 Hours" : minutes + " Minute(s)"
        }?`
      )
    ) {
      temporaryDisable(minutes);
    }
  });

  // domain lookup events
  document.getElementById("checkDomainBtn").addEventListener("click", checkDomain);
  document.getElementById("domainInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkDomain();
  });
  document.getElementById("domainActionBtn").addEventListener("click", applyDomainAction);

  // settings button event: opens the options page
  document.getElementById("settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // update-check on click
  document
    .getElementById("checkUpdateBtn")
    .addEventListener("click", () => checkForUpdateAndShow());
});
