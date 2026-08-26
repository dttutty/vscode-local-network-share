# Remote Local Network Share

[English](README.md) | **简体中文**

这个扩展主要面向网络受限的内网服务器和计算节点：服务器可以通过 SSH
连接，但由于出口控制、防火墙、DNS 限制或网络隔离，无法访问开发所需的
外部资源。常见情况包括无法访问 GitHub、APT 软件源、pip/PyPI、Conda
频道、npm Registry、文档网站或其他软件源。

如果你的 laptop 可以通过 VPN、局域网或互联网访问这些资源，本扩展可以
把 laptop 的网络连接共享给 VS Code Remote-SSH 打开的 Linux/macOS 主机。
它会建立一个仅绑定远端回环地址的反向 SOCKS5 隧道，并向新建的 VS Code
集成终端注入代理环境变量。请仅在获得授权且符合所在组织网络政策的前提下
使用。

## 环境要求

- 桌面版 VS Code 的 Remote-SSH 窗口。目前不支持 Dev Containers、WSL、
  Codespaces 和浏览器版 VS Code。
- 本地 OpenSSH 客户端需要支持动态远程端口转发。
- 额外的隧道连接需要使用 SSH 密钥或 SSH Agent 认证。
- 远端 SSH 服务器管理员需要启用 `AllowTcpForwarding`。

## 使用方法

在 Activity Bar 中打开独立的 **Local Network Share** 图标，即可查看隧道
状态和共享控制。这个扩展不会在 Explorer 中添加视图。

1. 使用 VS Code Remote-SSH 连接服务器。
2. 点击 Activity Bar 中的 **Local Network Share** 图标。
3. 选择 **Start sharing**。
4. 新建一个集成终端。

新终端会收到以下环境变量：

```sh
ALL_PROXY=socks5h://127.0.0.1:17890
HTTP_PROXY=socks5h://127.0.0.1:17890
HTTPS_PROXY=socks5h://127.0.0.1:17890
```

已经打开的终端会保留旧环境，需要关闭后重新打开。如果终端或工具没有自动
获得代理变量，可以使用 **Copy proxy environment**。

## 工具兼容性

扩展提供的是 `socks5h://` 代理。代理环境变量并不是所有工具共同遵守的统一
标准，因此实际兼容性取决于工具及其版本。下表根据所链接的官方文档整理。

- ✅ 在新建的集成终端中，可直接使用当前 SOCKS5h 隧道。
- ⚠️ 工具支持代理，但需要额外配置，或依赖可选/运行时组件提供 SOCKS 支持。
- ❌ 仅靠当前终端变量和 SOCKS5h 端点无法使用。

| 工具 | 状态 | 说明与快速测试 |
| --- | --- | --- |
| [curl](https://curl.se/docs/manpage.html) | ✅ | 会读取注入的代理变量，并支持 `socks5h://`。测试：`curl https://api.ipify.org`。 |
| [Git HTTPS](https://git-scm.com/docs/git-config#Documentation/git-config.txt-httpproxy) | ✅ | Git 使用 curl 的代理语法，通常读取 `http_proxy`、`https_proxy` 和 `all_proxy`。测试：`git ls-remote https://github.com/git/git.git HEAD`。这不会代理 `git@github.com:...` remote 使用的 SSH 协议。 |
| [APT](https://manpages.debian.org/unstable/apt/apt-transport-http.1.en.html#Proxy_Configuration) | ⚠️ | APT 原生支持 `socks5h://`，但 `sudo` 通常会清除代理变量。可显式传入变量测试：`sudo env http_proxy="$http_proxy" https_proxy="$https_proxy" no_proxy="$no_proxy" apt update`。持久配置需要同时设置 `Acquire::http::Proxy` 和 `Acquire::https::Proxy`。 |
| [npm](https://docs.npmjs.com/cli/v11/using-npm/config/#https-proxy) | ✅ | 当前 npm 会读取 `HTTP_PROXY` 和 `HTTPS_PROXY`，其当前[代理组件](https://github.com/npm/agent#features)支持 SOCKS4/5。测试：`npm ping`。旧版 npm 可能不同。 |
| [Homebrew](https://docs.brew.sh/Manpage#using-homebrew-behind-a-proxy) | ✅ | Homebrew 官方支持在 `all_proxy` 中使用 SOCKS5 URL。测试：`brew update`。 |
| [uv](https://docs.astral.sh/uv/reference/environment/#all_proxy) | ✅ | 当前 uv 会把 `ALL_PROXY` 用于所有网络请求，并已提供 [SOCKS 支持](https://github.com/astral-sh/uv/issues/7484)。测试：`uv pip install --dry-run requests`。旧版拒绝该 URL 时请升级 uv。 |
| [Cargo](https://doc.rust-lang.org/cargo/reference/config.html#httpproxy) | ✅ | Cargo 通过 `HTTP_PROXY`、`HTTPS_PROXY` 或 `CARGO_HTTP_PROXY` 接受 libcurl 代理语法。测试：`cargo search serde --limit 1`。 |
| [pip](https://pip.pypa.io/en/stable/user_guide/#using-a-proxy-server) | ⚠️ | pip 会读取 `http_proxy` 和 `https_proxy` 并接受代理 URL，但 SOCKS 是否可用取决于已安装的 pip/Requests/PySocks 组件。测试：`python -m pip index versions pip`。如果提示缺少 SOCKS 支持，需要 HTTP CONNECT 转换代理。 |
| [Conda](https://docs.conda.io/projects/conda/en/stable/user-guide/configuration/settings.html#proxy-servers-configure-conda-for-use-behind-a-proxy-server) | ⚠️ | Conda 会读取 `HTTP_PROXY` 和 `HTTPS_PROXY`，但官方 `.condarc` 只明确说明 HTTP/HTTPS 代理；SOCKS 行为取决于其 Python 网络组件。测试：`conda search python`。若拒绝 `socks5h://`，需要 HTTP CONNECT 转换代理。 |
| [Docker build/run](https://docs.docker.com/engine/cli/proxy/) | ⚠️ | 需要把变量传进构建或容器，例如 `docker build --build-arg ALL_PROXY --build-arg HTTP_PROXY --build-arg HTTPS_PROXY .`。镜像/容器里的下载工具也必须支持 SOCKS。 |
| [Docker pull](https://docs.docker.com/engine/daemon/proxy/) | ❌ | 拉取镜像的是 `dockerd`，不是当前终端进程。systemd 管理的 Docker daemon 不会继承这些变量，需要单独配置 daemon；官方配置面向 HTTP/HTTPS 代理，因此通常还需要 HTTP CONNECT 转换代理。 |
| [GNU Wget](https://www.gnu.org/software/wget/manual/html_node/Proxies.html) | ❌ | GNU Wget 官方只说明 HTTP/HTTPS/FTP 代理 URL，没有说明 SOCKS 或 `ALL_PROXY`。可以改用 curl，或在 SOCKS 隧道前增加 HTTP CONNECT 转换代理。 |

这份列表描述的是网络兼容性，并不保证某个工具的所有构建、插件或安装脚本
都能使用代理；子进程也可能使用自己的网络库。无法确定时，请在新建终端中
运行表里的快速测试，并用 `env | grep -i proxy` 检查变量。

## SSH 目标检测

扩展通常会根据当前远程工作区 URI 自动推断 SSH 配置别名。如果推断失败，
请把 `localNetworkShare.sshTarget` 设置为 Remote-SSH 使用的同一目标，例如：

```json
{
  "localNetworkShare.sshTarget": "dev-server"
}
```

跳板机、身份文件、用户名、端口等高级选项应配置在本地
`~/.ssh/config` 对应的别名中。

## “全局代理”的含义

扩展只会修改新建 VS Code 集成终端的环境，不会修改远端服务器的
`/etc/environment`、systemd 服务、Docker daemon、Firewall 或透明路由。
应用程序本身必须支持 SOCKS 代理 URL 或标准代理环境变量。

部分工具要求 `HTTP_PROXY` 和 `HTTPS_PROXY` 指向真正的 HTTP CONNECT
代理，不接受 `socks5h://` URL。遇到这种情况时，可以关闭
`localNetworkShare.injectHttpProxyVariables`，并让工具使用 `ALL_PROXY`；
也可以在未来版本中增加 HTTP CONNECT 代理模式。

## 安全说明

- 远端代理始终绑定到 `127.0.0.1`，扩展不会请求公开的 `0.0.0.0` 监听地址。
- 在共享的远程服务器上，其他用户仍可能访问回环 TCP 端口。不要在不可信的
  多用户主机上使用本扩展。
- 扩展使用 OpenSSH `BatchMode=yes`，不会收集或保存密码。
- 停止共享时，扩展会移除注入的环境变量修改并终止额外的 SSH 进程。

## 故障排查

在命令面板中运行 **Local Network Share: Show Log** 查看日志。

常见错误：

- `Permission denied`：为目标别名配置 SSH 密钥或 SSH Agent 认证。
- `remote port forwarding failed`：更换
  `localNetworkShare.remotePort`，或请服务器管理员启用远程 TCP 转发。
- `Could not resolve hostname`：设置 `localNetworkShare.sshTarget`，或检查
  本地 SSH 配置别名。

可以在本地终端中手动检查 OpenSSH 支持：

```sh
ssh -NT -o ExitOnForwardFailure=yes -R 127.0.0.1:17890 your-ssh-alias
```

在服务器上使用兼容的客户端测试代理：

```sh
curl --proxy socks5h://127.0.0.1:17890 https://example.com/
```

## 开发

```sh
npm install
npm test
npm run package
```

在 VS Code 中按 `F5` 启动 Extension Development Host。

## release 分支构建

每次向 GitHub 的 `release` 分支推送代码时，都会运行
`.github/workflows/release.yml`。工作流会安装锁定的依赖、运行测试、打包扩展，
并将 `remote-local-network-share-latest.vsix` 上传到滚动更新的
`release-branch-latest` prerelease。

工作流使用 GitHub 内置 Token，不需要 Marketplace 或 Azure 凭据。
prerelease 标签和 VSIX 资产会原地更新，因此下载地址始终保持不变。

## 许可证

MIT
