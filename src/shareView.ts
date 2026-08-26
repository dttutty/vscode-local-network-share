import * as vscode from 'vscode';
import {
  createAptInstallCommand,
  createOneTimeAptCommand,
  createPersistentAptCommand,
  REMOVE_PERSISTENT_APT_PROXY_COMMAND,
} from './aptCommands';
import type { TunnelState } from './tunnelManager';

export class ShareViewProvider implements vscode.TreeDataProvider<ShareItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<ShareItem | undefined>();
  private state: TunnelState = { phase: 'idle' };
  private target: string | undefined;
  private port = 17890;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  update(state: TunnelState, target: string | undefined, port: number): void {
    this.state = state;
    this.target = target;
    this.port = port;
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: ShareItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ShareItem): ShareItem[] {
    if (element) {
      return element.children ?? [];
    }

    const items: ShareItem[] = [this.statusItem(), this.targetItem()];

    if (this.state.phase === 'active') {
      const proxyUrl = `socks5h://127.0.0.1:${this.state.remotePort ?? this.port}`;
      const httpProxyUrl = `http://127.0.0.1:${this.state.remoteHttpPort ?? this.port + 1}`;
      items.push(
        new ShareItem('SOCKS5 proxy', proxyUrl, new vscode.ThemeIcon('radio-tower')),
        new ShareItem('HTTP proxy', httpProxyUrl, new vscode.ThemeIcon('globe')),
        new ShareItem(
          'New terminals use the proxy',
          'Reopen existing terminals',
          new vscode.ThemeIcon('terminal'),
        ),
        new ShareItem(
          'Copy proxy environment',
          undefined,
          new vscode.ThemeIcon('copy'),
          'localNetworkShare.copyProxyEnvironment',
        ),
        this.aptCommandsItem(),
        new ShareItem(
          'Stop sharing',
          undefined,
          new vscode.ThemeIcon('debug-stop'),
          'localNetworkShare.stop',
        ),
      );
    } else {
      items.push(
        new ShareItem(
          'Start sharing',
          undefined,
          new vscode.ThemeIcon('debug-start'),
          'localNetworkShare.start',
        ),
      );
    }

    items.push(
      new ShareItem('Open log', undefined, new vscode.ThemeIcon('output'), 'localNetworkShare.showOutput'),
      new ShareItem('Settings', undefined, new vscode.ThemeIcon('gear'), 'localNetworkShare.openSettings'),
      new ShareItem(
        'Open Advanced TUN Setup…',
        'Show in sidebar',
        new vscode.ThemeIcon('server-environment'),
        'localNetworkShare.openAdvancedTunSetup',
      ),
    );
    return items;
  }

  private aptCommandsItem(): ShareItem {
    const httpPort = this.state.remoteHttpPort ?? this.port + 1;
    return new ShareItem(
      'APT and sudo',
      'Copy working commands',
      new vscode.ThemeIcon('package'),
      undefined,
      [
        copyCommandItem(
          'Copy one-time apt update',
          'No persistent changes',
          'localNetworkShare.copyAptUpdate',
          createOneTimeAptCommand(httpPort),
        ),
        copyCommandItem(
          'Copy apt install command',
          'Replace PACKAGE_NAME',
          'localNetworkShare.copyAptInstall',
          createAptInstallCommand(httpPort),
        ),
        copyCommandItem(
          'Copy persistent APT setup',
          'Applies while sharing is active',
          'localNetworkShare.copyAptPersistentSetup',
          createPersistentAptCommand(httpPort),
        ),
        copyCommandItem(
          'Copy persistent setup removal',
          undefined,
          'localNetworkShare.copyAptPersistentRemoval',
          REMOVE_PERSISTENT_APT_PROXY_COMMAND,
          new vscode.ThemeIcon('trash'),
        ),
      ],
    );
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private statusItem(): ShareItem {
    const presentation: Record<TunnelState['phase'], { label: string; icon: vscode.ThemeIcon }> = {
      idle: { label: 'Not sharing', icon: new vscode.ThemeIcon('circle-outline') },
      starting: { label: 'Starting…', icon: new vscode.ThemeIcon('loading~spin') },
      active: { label: 'Sharing is active', icon: new vscode.ThemeIcon('pass-filled') },
      stopping: { label: 'Stopping…', icon: new vscode.ThemeIcon('loading~spin') },
      error: { label: 'Tunnel error', icon: new vscode.ThemeIcon('error') },
    };
    const current = presentation[this.state.phase];
    const item = new ShareItem('Status', current.label, current.icon);
    if (this.state.message) {
      item.tooltip = this.state.message;
    }
    return item;
  }

  private targetItem(): ShareItem {
    return new ShareItem(
      'SSH target',
      this.state.target ?? this.target ?? 'Select host…',
      new vscode.ThemeIcon('remote'),
      this.state.target || this.target ? undefined : 'localNetworkShare.chooseSshTarget',
    );
  }
}

class ShareItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string | undefined,
    icon: vscode.ThemeIcon,
    commandId?: string,
    readonly children?: ShareItem[],
  ) {
    super(
      label,
      children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    this.description = description;
    this.iconPath = icon;
    if (commandId) {
      this.command = { command: commandId, title: label };
    }
  }
}

function copyCommandItem(
  label: string,
  description: string | undefined,
  commandId: string,
  commandText: string,
  icon = new vscode.ThemeIcon('copy'),
): ShareItem {
  const item = new ShareItem(label, description, icon, commandId);
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown('Copies this command:\n\n');
  tooltip.appendCodeblock(commandText, 'shell');
  item.tooltip = tooltip;
  return item;
}
