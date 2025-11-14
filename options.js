// global state to display version, uptime, update-status
let pocState = {
  version: null,
  uptimestamp: null,
  updateAvailable: null,
  updateVersionKnown: null
};

// Helper function: if necessary, add http:// and port :5380 if not available.
function normalizeServerInput(input) {
  input = input.trim();
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    input = "http://" + input;
  }
  const url = new URL(input);
  if (!url.port) {
    url.port = "5380";
  }
  return url.origin;
}

// refresh version, uptime, color
function updatePocInfo(partialUpdate) {
  pocState = { ...pocState, ...partialUpdate };
  const { version, uptimestamp, updateAvailable, updateVersionKnown } = pocState;

  const versionEl = document.getElementById("pocVersion");
  const uptimeEl = document.getElementById("pocUptime");

  // version + update-status
  if (version) {
    let text = `Technitium Version: ${version}`;
    versionEl.className = "poc-version";

    if (updateAvailable === true) {
      text += updateVersionKnown
        ? ` → ${updateVersionKnown} available`
        : " (update available)";
      versionEl.classList.add("outdated");
    } else if (updateAvailable === false) {
      text += " (up to date)";
      versionEl.classList.add("ok");
    }
    versionEl.textContent = text;
  } else {
    versionEl.textContent = "Technitium Version: unknown";
    versionEl.className = "poc-version";
  }

  // uptime
  if (uptimestamp) {
    const upDate = new Date(uptimestamp);
    const now = new Date();
    const diffMs = now - upDate;

    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

    const dateStr = upDate.toLocaleString();
    let diffStr = "";
    if (days > 0) diffStr += `${days}d `;
    diffStr += `${hours}h ${minutes}m`;

    uptimeEl.textContent = `Server up since: ${dateStr} (for ${diffStr})`;
  } else {
    uptimeEl.textContent = "Server up since: unknown";
  }
}

// Check connection to the API and update status via /api/settings/get
async function checkConnection(server, token) {
  const statusEl = document.getElementById("connectionStatus");
  const url = `${server}/api/settings/get?token=${token}`;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      statusEl.textContent = `Connection: HTTP ${response.status}`;
      statusEl.className = "status error";
      return;
    }

    const data = await response.json();
    const settings = data.response || data;

    if (data.status === "ok") {
      statusEl.textContent = "Connection: successful";
      statusEl.className = "status success";
    } else {
      statusEl.textContent = `Connection: API error (${data.status})`;
      statusEl.className = "status error";
    }

    // Initial data: version + uptime, update-status unknown
    if (settings) {
      updatePocInfo({
        version: settings.version || null,
        uptimestamp: settings.uptimestamp || null,
        updateAvailable: null,
        updateVersionKnown: null
      });
    } else {
      updatePocInfo({
        version: null,
        uptimestamp: null,
        updateAvailable: null,
        updateVersionKnown: null
      });
    }
  } catch (error) {
    statusEl.textContent = "Connection: Error (" + error.message + ")";
    statusEl.className = "status error";
  }
}

// update-check via /api/user/checkForUpdate
async function checkForUpdateOptions(server, token) {
  const button = document.getElementById("checkUpdateBtn");

  // small visual feedback, without status bar
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "Checking...";

  try {
    const url = `${server}/api/user/checkForUpdate?token=${token}`;
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      // leave only version/uptime, no extra text
      console.error("Update check failed with HTTP", response.status);
      return;
    }

    const data = await response.json();
    if (!data.response || data.status !== "ok") {
      console.error("Update check API error", data.status);
      return;
    }

    const info = data.response;
    const current = info.currentVersion || pocState.version || "unknown";

    if (info.updateAvailable) {
      updatePocInfo({
        version: current,
        updateAvailable: true,
        updateVersionKnown: info.updateVersion || null
        // uptimestamp remains unchanged in state
      });
    } else {
      updatePocInfo({
        version: current,
        updateAvailable: false,
        updateVersionKnown: null
        // uptimestamp remains unchanged
      });
    }
  } catch (err) {
    console.error("Update check failed:", err);
    //
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const settingsSection = document.getElementById("settingsSection");

  // display the settings area when you click on the “Options” button
  openSettingsBtn.addEventListener("click", () => {
    settingsSection.style.display =
      settingsSection.style.display === "none" ? "block" : "none";
  });

  // load saved settings
  chrome.storage.local.get(["server", "apiKey"], (result) => {
    if (result.server) {
      document.getElementById("server").value = result.server;
    }
    if (result.apiKey) {
      document.getElementById("token").value = result.apiKey;
    }
    if (result.server && result.apiKey) {
      checkConnection(result.server, result.apiKey);
    }
  });

  // save and check connection
  document.getElementById("saveBtn").addEventListener("click", () => {
    let serverInput = document.getElementById("server").value;
    const token = document.getElementById("token").value.trim();
    if (!serverInput || !token) {
      alert("Please fill in both fields.");
      return;
    }
    serverInput = normalizeServerInput(serverInput);

    chrome.storage.local.set({ server: serverInput, apiKey: token }, () => {
      alert("Settings saved.");
      checkConnection(serverInput, token);
    });
  });

  // update-check button
  document.getElementById("checkUpdateBtn").addEventListener("click", () => {
    const serverInputRaw = document.getElementById("server").value.trim();
    const token = document.getElementById("token").value.trim();

    if (!serverInputRaw || !token) {
      alert("Please save the server and token first.");
      return;
    }

    const normalizedServer = normalizeServerInput(serverInputRaw);
    checkForUpdateOptions(normalizedServer, token);
  });
});
