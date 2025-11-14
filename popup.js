// popup.js

let countdownTimer = null;
let baseVersionText = ""; // will be filled after an update check

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
    const response = await fetch(`${server}/api/settings/get?token=${apiKey}`, { mode: "cors" });
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
    const url = `${server}/api/settings/set?token=${apiKey}&enableBlocking=${enable}`;
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
    const url = `${server}/api/settings/temporaryDisableBlocking?token=${apiKey}&minutes=${minutes}`;
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
    const url = `${server}/api/user/checkForUpdate?token=${apiKey}`;
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

  // settings button event: opens the options page
  document.getElementById("settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // update-check on click
  document
    .getElementById("checkUpdateBtn")
    .addEventListener("click", () => checkForUpdateAndShow());
});
