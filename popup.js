// popup.js

// Loads saved settings (server & API key)
async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["server", "apiKey"], (result) => {
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
      const data = await response.json();
      console.log("API response:", data); // Debug output
      // Evaluate the enableBlocking field from data.response
      const isBlockingEnabled = data.response && typeof data.response.enableBlocking !== 'undefined'
        ? data.response.enableBlocking
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
    chrome.action.setIcon({ path: iconPath });
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
  
  // Temporarily disables DNS blocking via the API call
  async function temporaryDisable(minutes) {
    const { server, apiKey } = await loadSettings();
    if (!server || !apiKey) {
      alert("Please configure the server and token in settings first.");
      return;
    }
    try {
      const url = `${server}/api/settings/temporaryDisableBlocking?token=${apiKey}&minutes=${minutes}`;
      const response = await fetch(url, { mode: "cors" });
      if (response.ok) {
        alert(`DNS Blocking disabled for ${minutes === "1440" ? "24 Hours" : minutes + " Minute(s)"} temporarily.`);
      } else {
        alert(`Error: HTTP ${response.status}`);
      }
    } catch (error) {
      alert("Error calling API: " + error.message);
    }
  }
  
  // Event listeners after DOM is loaded
  document.addEventListener("DOMContentLoaded", () => {
    checkBlockingStatus();
  
    // Toggle switch event: changes permanent blocking status
    document.getElementById("toggleSwitch").addEventListener("change", (e) => {
      toggleBlockingPermanent(e.target.checked);
    });
  
    // Dropdown event for temporary disable
    document.getElementById("tempDuration").addEventListener("change", (e) => {
      const minutes = e.target.value;
      if (confirm(`Do you want to temporarily disable DNS Blocking for ${minutes === "1440" ? "24 Hours" : minutes + " Minute(s)"}?`)) {
        temporaryDisable(minutes);
      }
    });
  
    // Settings button event: opens the options page
    document.getElementById("settingsBtn").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  });
  