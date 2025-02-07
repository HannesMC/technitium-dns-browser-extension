<p align="center"> 
  <img src="./icon_green.png" alt="TechnitiumLogo" width="128" height=128>
</p>

# <p align="center"> **Technitium DNS Block Control Extension** </p>

This browser extension was created as a **proof of concept** with the help of **AI** to explore the feasibility of managing DNS blocking on a **Technitium DNS Server** via its API.  

> [!WARNING]
> 🚨 **Disclaimer:** This project is experimental and provided "as is" without any guarantees. **Use at your own risk.** The author assumes no responsibility for any issues arising from its usage.

## Features

- **Temporarily disable blocking** for predefined durations (1 min, 5 min, 15 min, etc.).
- **Permanently toggle DNS blocking** on or off with a switch.
- **Real-time status indicator:** Green icon when blocking is active, red when disabled.
- **Configurable server URL and API token** via the options page.
- **Intuitive UI with a modern design** for easy control.

## Preview 
![PreviewBlockingEnabled](./preview_popup_green.png) ![PreviewBlockingDisabled](./preview_popup_red.png)
![PreviewSettings](./preview_settings.png)


## Installation

### Load the extension in Chrome (Developer Mode)

Clone this repository:
   ```bash
   git clone https://github.com/HannesMC/technitium-dns-extension.git
  ```
1. Open Google Chrome and go to chrome://extensions/
2. Enable Developer mode (toggle in the top right corner)
3. Click Load unpacked and select the cloned repository folder
4. The extension should now be visible in your browser

 ## Usage

1. Click on the extension icon to open the popup.
2. Use the switch to permanently enable or disable DNS blocking.
3. Use the dropdown to temporarily disable blocking for a selected duration.
4. Click on the settings icon to enter your Technitium server URL and API token.
5. The extension will automatically update the icon color based on the blocking status.

## License

This project is licensed under the [**GPL-3.0 License**](https://github.com/HannesMC/technitium-dns-browser-extension/blob/main/LICENSE).
See the LICENSE file for full details.

## Credits

- **Technitium Icons** – Used under GPL-3.0 License.
  - See [Technitium DNS Server](https://github.com/TechnitiumSoftware/DnsServer) for details.
- **Gear Icon from Google Material Icons** - Licensed unter [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
  - See [Google Material Icons](https://fonts.google.com/icons) for more details.



