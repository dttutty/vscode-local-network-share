# Changelog

## 0.2.10

- Require Remote - SSH 0.126.0 or newer at runtime, with an actionable sidebar warning and disabled sharing when the installed version is missing or too old.
- Rewrite the TUN mode introduction in plain language to explain when the mode is useful and what it does.
- Clarify that the final TUN step reviews and copies setup commands for manual execution instead of starting privileged network changes automatically.
- Add **Prepare Start TUN** and **Prepare Stop TUN** buttons that place reviewed, non-auto-submitted commands into a remote terminal; include isolated namespace relays and SSH recovery-route preservation for global mode.
- Require an open folder on the Remote-SSH target, with a clear sidebar warning and disabled Start button instead of prompting users in empty windows for an SSH alias.

## 0.2.9

- Fix APT and sudo command cards so every generated command is displayed as visible text instead of showing only its short title.
- Place the command cards under an expandable **Frequent commands** control inside the **APT and sudo** proxy-coverage item.
- Add an explicit-proxy `sudo apt upgrade` command alongside update, install, persistent setup, and removal.

## 0.2.8

- Explain the SSH reverse-tunnel and loopback-proxy design while sharing is inactive, then hide the explanation as soon as startup begins.

## 0.2.7

- Hide Proxy coverage and APT/sudo commands until network sharing is active, and hide them again after sharing stops.

## 0.2.6

- Present APT/sudo commands as non-editable rounded code cards with a compact copy icon in each card's upper-right corner.

## 0.2.5

- Move Open log and Settings to two compact View title icons in the upper-right corner.
- Remove the redundant footer buttons, including Advanced TUN now that the persistent TUN mode tab is the canonical entry.

## 0.2.4

- Replace the TUN risk checkbox with an I acknowledge safety gate; advanced controls remain hidden until acknowledged, then the warning card disappears.

## 0.2.3

- Fix a TUN page inline-script syntax error that prevented all controls, including Basic mode, from registering click handlers.
- Validate the generated inline JavaScript for both Webview modes during the test run.
- Render Basic mode and TUN mode inside one Sidebar Webview so tab switching no longer depends on hiding, recreating, or refocusing separate VS Code views.
- Switch to TUN mode immediately without a redundant modal warning; the persistent risk warning and recovery-access acknowledgement remain inside the TUN interface.

## 0.2.2

- Add a persistent Basic mode / TUN mode tab bar at the top of both sidebar interfaces.
- Show every APT/sudo command in a read-only text box with a Copy button in the upper-right corner.
- Fix returning from Advanced TUN by reopening the Local Network Share container after switching view context and then focusing the main dashboard.

## 0.2.1

- Switch between the Network Sharing and Advanced TUN Sidebar Webviews instead of leaving both interfaces open.
- Add a Back to Network Sharing control while preserving the active proxy tunnel until the user explicitly stops it.

## 0.2.0

- Replace the native Share Status tree with a custom Sidebar Webview dashboard for connection state, target selection, Start/Stop, proxy endpoints, coverage, APT actions, logs, settings, and Advanced TUN.
- Remove duplicate native view-title action icons and present explanations and actions in context.

## 0.1.9

- Add an expandable Proxy coverage section showing which common tools are usually covered in new terminals, which require manual configuration, and which are not managed.
- Distinguish environment-based compatibility from live process inspection and account for the HTTP proxy variable setting.

## 0.1.8

- Replace vague Advanced TUN readiness failures with specific status labels, visible explanations, impact, and next steps.
- Treat password-protected, custom sudoers, and LDAP/AD sudo access as a manual verification warning instead of incorrectly implying that administrator access is absent.

## 0.1.7

- Move the custom Advanced TUN workflow into a collapsible Sidebar Webview instead of opening a separate editor tab.
- Adapt the guided interface for the narrower sidebar and collapse setup/review details by default.

## 0.1.6

- Add a prominent Check → Start → Stop workflow to the Advanced TUN page and highlight the current stage.
- Allow the remote readiness check to run before network sharing starts and retain its results after sharing stops.

## 0.1.5

- Add a loopback-only HTTP CONNECT bridge alongside the SOCKS5 endpoint for tools such as pip, Conda, and Wget.
- Detect remote sudo access with a non-interactive read-only check and provide reviewable APT setup/removal commands.
- Move Advanced TUN out of the native tree into a dedicated Webview setup page with safety confirmation, friendly readiness cards, routing/interface/MTU/DNS options, rechecking, and a reviewable plan.
- Replace the unclear missing-target error with an inline SSH host picker that saves the user's Remote-SSH alias and continues startup.
- Add an APT and sudo sidebar section with one-click copy actions for update, install, persistent proxy setup, and removal without relying on `sudo -E`.
- Show the exact generated shell command in a hover tooltip for every APT copy action.

## 0.1.4

- Refine the Activity Bar icon and use the clear laptop-to-server tunnel design for the Marketplace icon.
- Add an English and Chinese tool compatibility matrix for APT, npm, Conda, Docker, Homebrew, pip, uv, and other common clients.

## 0.1.3

- Move Local Network Share from the Explorer into its own Activity Bar sidebar
  so the status and sharing controls are easier to find.
- Declare Remote-SSH as an extension dependency and align the Activity Bar icon
  with the computer-to-server tunnel used by the Marketplace logo.

## 0.1.2

- Add CI that tests and packages the extension on every push to the GitHub
  `release` branch and uploads the VSIX to a rolling prerelease.

## 0.1.1

- Replace the extension icon with a clearer, letter-free network tunnel design.

## 0.1.0

- Add an Explorer sidebar view for starting and stopping local network sharing.
- Create a loopback-only dynamic SSH remote forward that acts as a SOCKS5 proxy.
- Inject proxy variables into newly created VS Code integrated terminals.
- Add automatic Remote-SSH target detection, configurable target and port, logs, and optional auto-start.
