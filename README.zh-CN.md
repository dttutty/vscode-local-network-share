# Remote Local Network Share

[English](README.md) | **简体中文**

让网络受限的 Remote-SSH 服务器通过你的笔记本访问外部资源。适用于服务器无法
访问 GitHub、APT、PyPI、Conda、Hugging Face、npm 等软件源，但笔记本可以访问
这些资源的情况。

## 工作原理

扩展会在本地启动一条额外的 OpenSSH 连接，并在远端提供仅绑定回环地址的代理：

```sh
ALL_PROXY=socks5h://127.0.0.1:17890
HTTP_PROXY=http://127.0.0.1:17891
HTTPS_PROXY=http://127.0.0.1:17891
```

新建的 VS Code 终端会自动获得这些环境变量。Basic mode 不会开放公网端口，也
不会修改服务器的默认路由。

## 快速使用

1. 使用 VS Code Remote-SSH 连接服务器，并在远端打开一个文件夹。
2. 从 Activity Bar 打开 **Local Network Share**。
3. 点击 **Start sharing**。
4. 新建集成终端，运行 `curl https://api.ipify.org` 测试。

已经打开的终端需要重新打开，或使用 **Copy proxy environment**。

## 工具兼容性

| 覆盖情况 | 工具 |
| --- | --- |
| 新终端通常自动生效 | curl、Git HTTPS、pip、uv、Conda、npm、Wget、Homebrew、Cargo、Hugging Face `hf` |
| 需要手动配置 | APT/sudo、Docker daemon、systemd、cron |
| 需要应用专用设置 | Git SSH、无法访问主机回环地址的容器，以及忽略代理变量的程序 |

共享启动后，侧栏会显示 Proxy coverage，并提供可复制的 APT/sudo 常用命令。
工具自己的代理设置可能覆盖扩展注入的环境变量。

## 环境要求

- 桌面版 VS Code 和 Microsoft **Remote - SSH**，不要求特定 Remote-SSH 版本。
- 本地 OpenSSH 客户端，以及 SSH 密钥或 SSH Agent 认证。
- SSH 服务器已启用 `AllowTcpForwarding`。
- 当前 Remote-SSH 窗口已经打开远端文件夹。

跳板机、端口、身份文件和用户名应配置在本地 `~/.ssh/config` 中。扩展通常会
自动复用当前连接使用的 SSH alias。

## TUN mode

TUN mode 面向不支持 SOCKS5 或 HTTP 代理设置的程序。它只会生成可检查的命令，
不会在后台提交 sudo、创建网卡或修改路由。优先使用隔离的 network namespace。

**全局路由可能中断 SSH 并影响其他用户。只有在具备物理访问或 BMC、IPMI、
iDRAC、iLO 等带外恢复能力时才应使用。**

## 故障排查

点击侧栏右上角的日志图标查看输出。

- `Permission denied`：配置 SSH 密钥或 SSH Agent。
- `remote port forwarding failed`：更换远端端口或启用 SSH TCP forwarding。
- `Could not resolve hostname`：检查本地 SSH alias，或设置 `localNetworkShare.sshTarget`。

## 开发

```sh
npm install
npm test
npm run package
```

## 许可证

MIT
