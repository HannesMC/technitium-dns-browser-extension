// Helper function: if necessary, add http:// and port :5380 if not available.
function normalizeServerInput(input) {
    input = input.trim();
    if (!input.startsWith("http://") && !input.startsWith("https://")) {
      input = "http://" + input;
    }
    // If no port is specified, append :5380
    const url = new URL(input);
    if (!url.port) {
      url.port = "5380";
    }
    return url.origin;
  }
  
  // Check connection to the API and update status
  function checkConnection(server, token) {
    const statusEl = document.getElementById("connectionStatus");
    const url = `${server}/api/settings/status?token=${token}`;
    fetch(url, { mode: "cors" })
      .then(response => {
        if (response.ok) {
          statusEl.textContent = "Connection: successful";
          statusEl.className = "status success";
        } else {
          statusEl.textContent = `Connection: HTTP ${response.status}`;
          statusEl.className = "status error";
        }
      })
      .catch(error => {
        statusEl.textContent = "Connection: Error (" + error.message + ")";
        statusEl.className = "status error";
      });
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    const openSettingsBtn = document.getElementById("openSettingsBtn");
    const settingsSection = document.getElementById("settingsSection");
    
    // Display the settings area when you click on the “Options” button
    openSettingsBtn.addEventListener("click", () => {
      settingsSection.style.display = settingsSection.style.display === "none" ? "block" : "none";
    });
    
    // Load saved settings
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
    
    // Save and check connection
    document.getElementById("saveBtn").addEventListener("click", () => {
      let serverInput = document.getElementById("server").value;
      const token = document.getElementById("token").value.trim();
      if (!serverInput || !token) {
        alert("Bitte beide Felder ausfüllen.");
        return;
      }
      // Normalize: Prepend http:// and append port :5380 if not available
      serverInput = normalizeServerInput(serverInput);
      
      chrome.storage.local.set({ server: serverInput, apiKey: token }, () => {
        alert("Settings saved.");
        checkConnection(serverInput, token);
      });
    });
  });
  