# Remote Local Network Share

Share the network access of the computer running VS Code with a Linux/macOS host opened through VS Code Remote-SSH. The extension creates a loopback-only reverse SOCKS5 tunnel and injects proxy variables into newly created integrated terminals.

This is useful when a remote development server needs to reach resources available only through your laptop's VPN, local network, or internet connection.

## Requirements

- A desktop VS Code Remote-SSH window. Dev Containers, WSL, Codespaces, and browser-based VS Code are not supported yet.
- A local OpenSSH client with support for dynamic remote forwarding.
- Key-based or SSH Agent authentication for the additional tunnel connection.
- `AllowTcpForwarding` enabled by the remote SSH server administrator.

## Use

1. Connect to the server with VS Code Remote-SSH.
2. Open **Local Network Share** in the Explorer sidebar.
3. Select **Start sharing**.
4. Open a new integrated terminal.

The new terminal receives:

```sh
ALL_PROXY=socks5h://127.0.0.1:17890
HTTP_PROXY=socks5h://127.0.0.1:17890
HTTPS_PROXY=socks5h://127.0.0.1:17890
```

Existing terminals keep their old environment and must be reopened. Use **Copy proxy environment** when a terminal or tool does not receive the injected values automatically.

## SSH target detection

The extension normally infers the SSH config alias from the current remote workspace URI. If this fails, set `localNetworkShare.sshTarget` to the same destination used by Remote-SSH, for example:

```json
{
  "localNetworkShare.sshTarget": "dev-server"
}
```

Jump hosts, identity files, usernames, ports, and other advanced options should be configured under that alias in your local `~/.ssh/config`.

## What “global proxy” means

The extension changes the environment of newly created VS Code integrated terminals. It does not modify `/etc/environment`, systemd services, Docker daemon settings, firewall rules, or transparent system routing on the server. Applications must support SOCKS proxy URLs or the standard proxy environment variables.

Some tools require `HTTP_PROXY` and `HTTPS_PROXY` to point to a true HTTP CONNECT proxy and reject a `socks5h://` URL. For those tools, disable `localNetworkShare.injectHttpProxyVariables` and configure the tool to use `ALL_PROXY`, or add an HTTP CONNECT proxy mode in a future version.

## Security

- The remote proxy always binds to `127.0.0.1`; the extension never requests a public `0.0.0.0` listener.
- Other users on a shared remote server may still be able to connect to a loopback TCP port. Do not use this extension on an untrusted multi-user host.
- The extension uses OpenSSH `BatchMode=yes` and does not collect or store passwords.
- Stopping the share removes the injected environment mutations and terminates the additional SSH process.

## Troubleshooting

Open **Local Network Share: Show Log** from the Command Palette.

Common errors:

- `Permission denied`: configure key or SSH Agent authentication for the target alias.
- `remote port forwarding failed`: choose another `localNetworkShare.remotePort`, or ask the server administrator to enable remote TCP forwarding.
- `Could not resolve hostname`: set `localNetworkShare.sshTarget` or verify the local SSH config alias.

You can verify OpenSSH support manually from a local terminal:

```sh
ssh -NT -o ExitOnForwardFailure=yes -R 127.0.0.1:17890 your-ssh-alias
```

On the server, test a compatible client with:

```sh
curl --proxy socks5h://127.0.0.1:17890 https://example.com/
```

## Development

```sh
npm install
npm test
npm run package
```

Press `F5` in VS Code to launch an Extension Development Host.

## Release branch builds

Every push to the GitHub `release` branch runs
`.github/workflows/release.yml`. The workflow installs locked dependencies,
runs the test suite, packages the extension, and uploads
`remote-local-network-share-latest.vsix` to the rolling
`release-branch-latest` prerelease.

The workflow uses GitHub's built-in token and does not require Marketplace or
Azure credentials. The prerelease tag and VSIX asset are updated in place, so
the download URL remains stable across release-branch builds.

## License

MIT
