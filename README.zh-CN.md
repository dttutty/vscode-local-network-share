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
