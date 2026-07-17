// Background Service Worker
// Keeps the toolbar icon in sync with the DNS blocking status, even while the
// popup is closed, by polling the Technitium API on an alarm.

const STATUS_ALARM = "tbcStatusCheck";
const POLL_MINUTES = 1;

chrome.runtime.onInstalled.addListener(() => {
  console.log("Technitium DNS Block Control Extension installed.");
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: POLL_MINUTES });
  refreshIcon();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: POLL_MINUTES });
  refreshIcon();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATUS_ALARM) {
    refreshIcon();
  }
});

// Loads saved settings (server & API key).
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["server", "apiKey"], (result) => resolve(result));
  });
}

// Polls the current blocking status and updates the toolbar icon accordingly.
async function refreshIcon() {
  const { server, apiKey } = await loadSettings();
  if (!server || !apiKey) {
    setIcon("icon.png"); // neutral icon when unconfigured
    return;
  }

  try {
    const usp = new URLSearchParams({ token: apiKey });
    const response = await fetch(`${server}/api/settings/get?${usp.toString()}`, { mode: "cors" });
    if (!response.ok) return;

    const data = await response.json();
    const settings = data.response || data;
    const enabled =
      settings && typeof settings.enableBlocking !== "undefined"
        ? settings.enableBlocking
        : false;

    setIcon(enabled ? "icon_green.png" : "icon_red.png");
  } catch (error) {
    console.warn("Background status check failed:", error.message);
  }
}

function setIcon(path) {
  if (chrome.action && chrome.action.setIcon) {
    chrome.action.setIcon({ path });
  }
}
