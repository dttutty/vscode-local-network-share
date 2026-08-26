# Changelog

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
