# Remote Local Network Share

[English](README.md) | **简体中文**

让网络受限的 Remote-SSH 主机通过你的笔记本访问外部资源。适用于服务器无法
访问 GitHub、软件源、Hugging Face 等资源，但笔记本可以访问的情况。

## 工作原理

```text
远端程序
   │
   ▼
127.0.0.1:17890（SOCKS5）/ 17891（HTTP）
   │
   ▼
OpenSSH 反向转发
   │
   ▼
笔记本网络 → 外部资源
```

扩展作为 VS Code UI extension 在本地运行，并启动额外的本地 OpenSSH 客户端。
远端代理端口和数据转发均由 OpenSSH 提供，因此服务器上不需要安装配套扩展。

新建集成终端会获得 `ALL_PROXY`、`HTTP_PROXY` 和 `HTTPS_PROXY`。Basic mode
只绑定远端 `127.0.0.1`，不会开放公网端口，也不会修改服务器默认路由。

## 代理覆盖

| 通常自动生效 | 需要手动或应用专用配置 |
| --- | --- |
| curl、Git HTTPS、pip、uv、Conda、npm、Wget、Homebrew、Cargo、Hugging Face `hf` | APT/sudo、Docker daemon、systemd、cron、Git SSH，以及忽略代理变量的程序 |

APT/sudo 常用命令和当前代理覆盖情况可直接在扩展侧栏中查看。

## 环境要求

- 桌面版 VS Code 和 Microsoft **Remote - SSH**，不要求特定版本。
- 本地 OpenSSH，以及 SSH 密钥或 SSH Agent 认证。
- SSH 服务器已启用 `AllowTcpForwarding`。

SSH alias、跳板机、端口和身份文件均读取本地 `~/.ssh/config`。

## TUN mode

TUN mode 为不支持代理设置的程序生成可检查命令，不会在后台提交 sudo 或修改
网络配置。

**全局路由可能中断 SSH。只有在具备物理访问或 BMC、IPMI、iDRAC、iLO 等
带外恢复能力时才应使用。**

## 许可证

MIT
