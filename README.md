# Remote Local Network Share

[English](README.md) | [简体中文](README.zh-CN.md)

This extension is primarily designed for restricted internal servers and compute
nodes that are reachable through SSH but cannot access required external
resources because of egress controls, firewall rules, DNS restrictions, or an
isolated network. Typical blocked resources include GitHub, APT repositories,
pip/PyPI, Conda channels, npm registries, documentation sites, and other software
sources.

When your laptop can access those resources through its VPN, local network, or
internet connection, the extension shares that connectivity with a Linux/macOS
host opened through VS Code Remote-SSH. It creates loopback-only SOCKS5 and HTTP
CONNECT endpoints and injects proxy variables into newly created integrated
terminals. Use it only when authorized and in accordance with your organization's
network policies.

## Requirements

- A desktop VS Code Remote-SSH window. Dev Containers, WSL, Codespaces, and browser-based VS Code are not supported yet.
- A local OpenSSH client with support for dynamic remote forwarding.
- Key-based or SSH Agent authentication for the additional tunnel connection.
- `AllowTcpForwarding` enabled by the remote SSH server administrator.

## Use

Open the **Local Network Share** icon in the Activity Bar to see the tunnel
status and sharing controls. The extension uses its own sidebar and does not
add a view to the Explorer.

1. Connect to the server with VS Code Remote-SSH.
2. Open **Local Network Share** from its icon in the Activity Bar.
3. Select **Start sharing**.
4. Open a new integrated terminal.

The new terminal receives:

```sh
ALL_PROXY=socks5h://127.0.0.1:17890
HTTP_PROXY=http://127.0.0.1:17891
HTTPS_PROXY=http://127.0.0.1:17891
```

Existing terminals keep their old environment and must be reopened. Use **Copy proxy environment** when a terminal or tool does not receive the injected values automatically.

## Tool compatibility

The tunnel exposes both a `socks5h://` endpoint and a true HTTP CONNECT endpoint.
`ALL_PROXY` uses SOCKS5h, while the HTTP variables use the HTTP endpoint. Proxy
environment variables are not a single universal standard, so compatibility
still depends on both the tool and its version. The table below is based on the
linked official documentation.

- ✅ Works directly in a new integrated terminal.
- ⚠️ The tool supports proxies, but needs extra privileged or per-tool configuration.
- ❌ The two terminal proxy endpoints are not sufficient.

| Tool | Status | Notes and quick test |
| --- | --- | --- |
| [curl](https://curl.se/docs/manpage.html) | ✅ | Honors the injected proxy variables and supports `socks5h://`. Test: `curl https://api.ipify.org`. |
| [Git over HTTPS](https://git-scm.com/docs/git-config#Documentation/git-config.txt-httpproxy) | ✅ | Git uses curl proxy syntax and normally reads `http_proxy`, `https_proxy`, and `all_proxy`. Test: `git ls-remote https://github.com/git/git.git HEAD`. This does not proxy the SSH protocol used by a `git@github.com:...` remote. |
| [APT](https://manpages.debian.org/unstable/apt/apt-transport-http.1.en.html#Proxy_Configuration) | ⚠️ | APT supports explicit proxy configuration, but `sudo` commonly removes terminal variables. When sudo access is detected, use **Configure APT for sudo** in the sidebar to copy a one-time, persistent, or removal command. |
| [npm](https://docs.npmjs.com/cli/v11/using-npm/config/#https-proxy) | ✅ | Current npm honors `HTTP_PROXY` and `HTTPS_PROXY`. Test: `npm ping`. |
| [Homebrew](https://docs.brew.sh/Manpage#using-homebrew-behind-a-proxy) | ✅ | Homebrew officially supports a SOCKS5 URL in `all_proxy`. Test: `brew update`. |
| [uv](https://docs.astral.sh/uv/reference/environment/#all_proxy) | ✅ | Current uv reads `ALL_PROXY` for all network requests and includes [SOCKS support](https://github.com/astral-sh/uv/issues/7484). Test: `uv pip install --dry-run requests`. Upgrade uv if an old release rejects the URL. |
| [Cargo](https://doc.rust-lang.org/cargo/reference/config.html#httpproxy) | ✅ | Cargo accepts libcurl proxy syntax through `HTTP_PROXY`/`HTTPS_PROXY` or `CARGO_HTTP_PROXY`. Test: `cargo search serde --limit 1`. |
| [pip](https://pip.pypa.io/en/stable/user_guide/#using-a-proxy-server) | ✅ | pip reads `http_proxy` and `https_proxy`, which now point to the HTTP endpoint. Test: `python -m pip index versions pip`. |
| [Conda](https://docs.conda.io/projects/conda/en/stable/user-guide/configuration/settings.html#proxy-servers-configure-conda-for-use-behind-a-proxy-server) | ✅ | Conda reads `HTTP_PROXY` and `HTTPS_PROXY`, which now use its documented HTTP proxy form. Test: `conda search python`. |
| [Docker build/run](https://docs.docker.com/engine/cli/proxy/) | ⚠️ | Pass variables into the build or container, for example `docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY .`. Containers need a route back to the remote-host loopback proxy, so `127.0.0.1` may need to be replaced with a host-reachable address. |
| [Docker pull](https://docs.docker.com/engine/daemon/proxy/) | ⚠️ | Pulls are performed by `dockerd`, not by the terminal process. The daemon requires separate privileged proxy configuration and must be restarted; point it at the HTTP endpoint only if local policy allows this temporary setup. |
| [GNU Wget](https://www.gnu.org/software/wget/manual/html_node/Proxies.html) | ✅ | GNU Wget supports `http_proxy` and `https_proxy`, which now point to the HTTP endpoint. Test: `wget -O- https://example.com/`. |

This list describes network compatibility, not a guarantee for every build or
plugin of a tool. Package-manager install scripts and subprocesses can use their
own networking libraries. When in doubt, run the quick test in a newly created
terminal and inspect `env | grep -i proxy`.

## SSH target detection

The extension normally infers the SSH config alias from the current remote workspace URI. An empty Remote-SSH window may not expose the alias to extensions. In that case, select **SSH target: Select host…** in the sidebar or start sharing and enter the same host selected in Remote-SSH. The extension saves the choice for later use. You can also set `localNetworkShare.sshTarget` directly, for example:

```json
{
  "localNetworkShare.sshTarget": "dev-server"
}
```

Jump hosts, identity files, usernames, ports, and other advanced options should be configured under that alias in your local `~/.ssh/config`.

## What “global proxy” means

The extension changes the environment of newly created VS Code integrated terminals. It does not modify `/etc/environment`, systemd services, Docker daemon settings, firewall rules, or transparent system routing on the server. Applications must support SOCKS proxy URLs or the standard HTTP proxy environment variables.

## Sudo and advanced transparent mode

After sharing starts, the extension performs a non-interactive, read-only check for sudo membership and relevant Linux capabilities. It never asks for or stores a sudo password. If sudo access is detected, the sidebar offers only **Configure APT for sudo**, which copies commands for you to review and paste yourself.

Transparent TUN mode appears only in an expandable advanced section at the bottom of the sidebar and is never enabled automatically. Risk information, recovery requirements, capability results, rechecking, and the setup guide all live in that section; there is no Command Palette entry. Before the guide opens, a modal warning requires the user to confirm physical access or out-of-band management such as BMC/IPMI/iDRAC/iLO. The extension does not create a TUN interface, install software, or change global routes or DNS. Changing a shared server's default route can disconnect SSH and affect other users, so any such setup remains manual and should preferably be isolated in a network namespace.

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
