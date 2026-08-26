# Changelog

## 0.1.5

- Add a loopback-only HTTP CONNECT bridge alongside the SOCKS5 endpoint for tools such as pip, Conda, and Wget.
- Detect remote sudo access with a non-interactive read-only check and provide reviewable APT setup/removal commands.
- Put transparent TUN risk information, capability checks, and setup guidance in an expandable bottom-of-sidebar section protected by an explicit physical/BMC-access warning; remove its Command Palette entry.
- Replace the unclear missing-target error with an inline SSH host picker that saves the user's Remote-SSH alias and continues startup.
- Simplify the Advanced TUN sidebar into a task-oriented readiness summary that shows only missing requirements and the next actions.

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
