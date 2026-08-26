# Changelog

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
