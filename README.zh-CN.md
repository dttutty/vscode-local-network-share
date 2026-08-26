# Remote Local Network Share

[English](README.md) | **简体中文**

这个扩展主要面向网络受限的内网服务器和计算节点：服务器可以通过 SSH
连接，但由于出口控制、防火墙、DNS 限制或网络隔离，无法访问开发所需的
外部资源。常见情况包括无法访问 GitHub、APT 软件源、pip/PyPI、Conda
频道、npm Registry、文档网站或其他软件源。

如果你的 laptop 可以通过 VPN、局域网或互联网访问这些资源，本扩展可以
把 laptop 的网络连接共享给 VS Code Remote-SSH 打开的 Linux/macOS 主机。
它会建立仅绑定远端回环地址的 SOCKS5 和 HTTP CONNECT 代理端点，并向
新建的 VS Code 集成终端注入代理环境变量。请仅在获得授权且符合所在组织
网络政策的前提下使用。

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
HTTP_PROXY=http://127.0.0.1:17891
HTTPS_PROXY=http://127.0.0.1:17891
```

已经打开的终端会保留旧环境，需要关闭后重新打开。如果终端或工具没有自动
获得代理变量，可以使用 **Copy proxy environment**。

## 工具兼容性

扩展同时提供 `socks5h://` 和真正的 HTTP CONNECT 代理。`ALL_PROXY` 使用
SOCKS5h，HTTP 相关变量使用 HTTP 端点。代理环境变量并不是所有工具共同
遵守的统一标准，因此实际兼容性仍取决于工具及其版本。下表根据所链接的
官方文档整理。

- ✅ 在新建的集成终端中可直接使用。
- ⚠️ 工具支持代理，但需要额外的特权操作或工具专用配置。
- ❌ 仅靠两个终端代理端点无法使用。

| 工具 | 状态 | 说明与快速测试 |
| --- | --- | --- |
| [curl](https://curl.se/docs/manpage.html) | ✅ | 会读取注入的代理变量，并支持 `socks5h://`。测试：`curl https://api.ipify.org`。 |
| [Git HTTPS](https://git-scm.com/docs/git-config#Documentation/git-config.txt-httpproxy) | ✅ | Git 使用 curl 的代理语法，通常读取 `http_proxy`、`https_proxy` 和 `all_proxy`。测试：`git ls-remote https://github.com/git/git.git HEAD`。这不会代理 `git@github.com:...` remote 使用的 SSH 协议。 |
| [APT](https://manpages.debian.org/unstable/apt/apt-transport-http.1.en.html#Proxy_Configuration) | ⚠️ | APT 支持显式代理配置，但 `sudo` 通常会清除终端变量。展开侧栏中的 **APT and sudo**，可复制可靠的单次 update/install 命令，或持久配置与移除命令。这些命令会显式传入 APT 代理参数，不依赖可能被 sudoers 策略限制的 `sudo -E`。 |
| [npm](https://docs.npmjs.com/cli/v11/using-npm/config/#https-proxy) | ✅ | 当前 npm 会读取 `HTTP_PROXY` 和 `HTTPS_PROXY`。测试：`npm ping`。 |
| [Homebrew](https://docs.brew.sh/Manpage#using-homebrew-behind-a-proxy) | ✅ | Homebrew 官方支持在 `all_proxy` 中使用 SOCKS5 URL。测试：`brew update`。 |
| [uv](https://docs.astral.sh/uv/reference/environment/#all_proxy) | ✅ | 当前 uv 会把 `ALL_PROXY` 用于所有网络请求，并已提供 [SOCKS 支持](https://github.com/astral-sh/uv/issues/7484)。测试：`uv pip install --dry-run requests`。旧版拒绝该 URL 时请升级 uv。 |
| [Cargo](https://doc.rust-lang.org/cargo/reference/config.html#httpproxy) | ✅ | Cargo 通过 `HTTP_PROXY`、`HTTPS_PROXY` 或 `CARGO_HTTP_PROXY` 接受 libcurl 代理语法。测试：`cargo search serde --limit 1`。 |
| [pip](https://pip.pypa.io/en/stable/user_guide/#using-a-proxy-server) | ✅ | pip 会读取 `http_proxy` 和 `https_proxy`，它们现在指向 HTTP 端点。测试：`python -m pip index versions pip`。 |
| [Conda](https://docs.conda.io/projects/conda/en/stable/user-guide/configuration/settings.html#proxy-servers-configure-conda-for-use-behind-a-proxy-server) | ✅ | Conda 会读取 `HTTP_PROXY` 和 `HTTPS_PROXY`，它们现在使用官方说明的 HTTP 代理形式。测试：`conda search python`。 |
| [Docker build/run](https://docs.docker.com/engine/cli/proxy/) | ⚠️ | 需要把变量传进构建或容器，例如 `docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY .`。容器还需要能访问远端主机的回环代理，因此可能需要把 `127.0.0.1` 换成容器可达的主机地址。 |
| [Docker pull](https://docs.docker.com/engine/daemon/proxy/) | ⚠️ | 拉取镜像的是 `dockerd`，不是当前终端进程。daemon 需要单独的特权代理配置并重启；仅在本地政策允许这种临时配置时才应指向 HTTP 端点。 |
| [GNU Wget](https://www.gnu.org/software/wget/manual/html_node/Proxies.html) | ✅ | GNU Wget 支持 `http_proxy` 和 `https_proxy`，它们现在指向 HTTP 端点。测试：`wget -O- https://example.com/`。 |

这份列表描述的是网络兼容性，并不保证某个工具的所有构建、插件或安装脚本
都能使用代理；子进程也可能使用自己的网络库。无法确定时，请在新建终端中
运行表里的快速测试，并用 `env | grep -i proxy` 检查变量。

## SSH 目标检测

扩展通常会根据当前远程工作区 URI 自动推断 SSH 配置别名。空的 Remote-SSH
窗口可能不会向扩展提供这个别名。此时可以点击侧栏中的 **SSH target: Select
host…**，或直接启动共享，然后输入 Remote-SSH 中选择的同一主机；扩展会保存
选择供以后使用。也可以直接设置 `localNetworkShare.sshTarget`，例如：

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
应用程序本身必须支持 SOCKS 代理 URL 或标准 HTTP 代理环境变量。

## sudo 与高级透明模式

共享启动后，扩展会以非交互、只读方式检查 sudo 成员身份以及相关 Linux
能力，绝不会请求或保存 sudo 密码。**APT and sudo** 区域会提供显式代理命令，
仍需由用户检查后自行粘贴执行，扩展不会自动运行这些 sudo 命令。

主侧栏只保留 **Open Advanced TUN Setup…**。用户明确确认拥有物理访问或
BMC/IPMI/iDRAC/iLO 等带外管理能力后，会打开独立的 Webview 设置页。页面
使用卡片展示易懂的准备状态、路由隔离、网卡名、MTU、DNS 选项、重新检测和
可审查的设置计划，不提供命令面板入口，也绝不会自动启用。当前版本不会请求
sudo 密码、创建 TUN 网卡、安装软件或修改路由/DNS。修改共享服务器的默认
路由可能导致 SSH 断线并影响其他用户，因此页面默认推荐 network namespace，
并明确把全局路由标记为高风险。

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
