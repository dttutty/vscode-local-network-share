# Remote Local Network Share

[English](README.md) | [简体中文](README.zh-CN.md)

Let a network-restricted Remote-SSH server access resources through your laptop.
It is useful when the server cannot reach GitHub, APT, PyPI, Conda, Hugging Face,
npm, or other sources, but your laptop can.

## How it works

The extension starts an additional local OpenSSH connection and creates
loopback-only proxy endpoints on the remote host:

```sh
ALL_PROXY=socks5h://127.0.0.1:17890
HTTP_PROXY=http://127.0.0.1:17891
HTTPS_PROXY=http://127.0.0.1:17891
```

New VS Code terminals receive these variables automatically. Basic mode does
not expose a public port or change the server's default route.

## Quick start

1. Connect with VS Code Remote-SSH and open a folder on the server.
2. Open **Local Network Share** from the Activity Bar.
3. Select **Start sharing**.
4. Open a new integrated terminal and test with `curl https://api.ipify.org`.

Existing terminals must be reopened or updated with **Copy proxy environment**.

## Compatibility

| Coverage | Tools |
| --- | --- |
| Usually automatic in new terminals | curl, Git HTTPS, pip, uv, Conda, npm, Wget, Homebrew, Cargo, Hugging Face `hf` |
| Manual setup | APT/sudo, Docker daemon, systemd, cron |
| Application-specific | Git SSH, containers that cannot reach the host loopback, and programs that ignore proxy variables |

The sidebar shows proxy coverage and provides copyable APT/sudo commands after
sharing starts. Tool-specific settings can override the injected environment.

## Requirements

- Desktop VS Code with Microsoft **Remote - SSH**; no specific Remote-SSH version is required.
- A local OpenSSH client and key or SSH Agent authentication.
- `AllowTcpForwarding` enabled on the SSH server.
- A remote folder open in the current Remote-SSH window.

Configure jump hosts, ports, identities, and usernames in your local
`~/.ssh/config`. The extension normally reuses the current SSH alias.

## TUN mode

TUN mode is for applications that cannot use SOCKS5 or HTTP proxy settings. It
prepares reviewable commands but never submits sudo or changes networking in the
background. Prefer the isolated network namespace option.

**Global routing can interrupt SSH and affect other users. Use it only when you
have physical or out-of-band recovery access such as BMC, IPMI, iDRAC, or iLO.**

## Troubleshooting

Open the log from the icon in the sidebar's upper-right corner.

- `Permission denied`: configure key or SSH Agent authentication.
- `remote port forwarding failed`: choose another remote port or enable SSH TCP forwarding.
- `Could not resolve hostname`: check the local SSH alias or set `localNetworkShare.sshTarget`.

## Development

```sh
npm install
npm test
npm run package
```

## License

MIT
