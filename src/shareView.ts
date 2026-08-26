import * as vscode from 'vscode';
import { TunnelState } from './tunnelManager';

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

  getChildren(): ShareItem[] {
    const items: ShareItem[] = [this.statusItem(), this.targetItem()];

    if (this.state.phase === 'active') {
      const proxyUrl = `socks5h://127.0.0.1:${this.state.remotePort ?? this.port}`;
      items.push(
        new ShareItem('Remote proxy', proxyUrl, new vscode.ThemeIcon('radio-tower')),
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
    );
    return items;
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
      this.state.target ?? this.target ?? 'Not detected',
      new vscode.ThemeIcon('remote'),
    );
  }
}

class ShareItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string | undefined,
    icon: vscode.ThemeIcon,
    commandId?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = icon;
    if (commandId) {
      this.command = { command: commandId, title: label };
    }
  }
}
