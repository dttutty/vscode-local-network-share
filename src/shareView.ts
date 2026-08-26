import * as vscode from 'vscode';
import type { CapabilityProbeState } from './remoteCapabilities';
import type { TunnelState } from './tunnelManager';

export class ShareViewProvider implements vscode.TreeDataProvider<ShareItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<ShareItem | undefined>();
  private state: TunnelState = { phase: 'idle' };
  private capabilities: CapabilityProbeState = { phase: 'idle' };
  private target: string | undefined;
  private port = 17890;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  update(state: TunnelState, target: string | undefined, port: number): void {
    this.state = state;
    this.target = target;
    this.port = port;
    this.changeEmitter.fire(undefined);
  }

  updateCapabilities(capabilities: CapabilityProbeState): void {
    this.capabilities = capabilities;
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
        ...this.capabilityItems(),
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
      this.advancedTunItem(),
    );
    return items;
  }

  private capabilityItems(): ShareItem[] {
    if (this.capabilities.phase === 'checking') {
      return [new ShareItem('Checking remote permissions…', undefined, new vscode.ThemeIcon('loading~spin'))];
    }
    if (this.capabilities.phase !== 'ready') {
      return [];
    }

    const { capabilities } = this.capabilities;
    if (capabilities.sudoAccess !== 'member' && capabilities.sudoAccess !== 'passwordless') {
      return [];
    }

    const sudoDescription = capabilities.sudoAccess === 'passwordless'
      ? 'Passwordless sudo detected'
      : 'Password may be required';
    return [
      new ShareItem('Sudo access detected', sudoDescription, new vscode.ThemeIcon('shield')),
      new ShareItem(
        'Configure APT for sudo',
        'Copy safe APT proxy commands',
        new vscode.ThemeIcon('package'),
        'localNetworkShare.configureAptProxy',
      ),
    ];
  }

  private advancedTunItem(): ShareItem {
    const children = [
      new ShareItem('Risk', 'May interrupt SSH access', new vscode.ThemeIcon('warning')),
      new ShareItem('Recovery access', 'Physical access or BMC required', new vscode.ThemeIcon('shield')),
      new ShareItem('Recommended routing', 'Isolated network namespace', new vscode.ThemeIcon('server-process')),
      ...this.advancedCapabilityItems(),
      new ShareItem(
        'Open safety and setup guide',
        'Requires explicit confirmation',
        new vscode.ThemeIcon('book'),
        'localNetworkShare.showAdvancedTunGuide',
      ),
    ];
    return new ShareItem(
      'Advanced TUN mode',
      'Advanced settings',
      new vscode.ThemeIcon('warning'),
      undefined,
      children,
    );
  }

  private advancedCapabilityItems(): ShareItem[] {
    if (this.capabilities.phase === 'checking') {
      return [new ShareItem('Requirements', 'Checking…', new vscode.ThemeIcon('loading~spin'))];
    }
    if (this.capabilities.phase !== 'ready') {
      return [new ShareItem(
        'Check requirements',
        'Start sharing first',
        new vscode.ThemeIcon('search'),
        this.state.phase === 'active' ? 'localNetworkShare.checkAdvancedTunRequirements' : 'localNetworkShare.start',
      )];
    }

    const { capabilities } = this.capabilities;
    const sudoLabel = capabilities.sudoAccess === 'passwordless'
      ? 'Available without a prompt'
      : capabilities.sudoAccess === 'member'
        ? 'Available; password may be required'
        : 'Not detected';
    return [
      new ShareItem('sudo access', sudoLabel, capabilityIcon(capabilities.sudoAccess === 'member' || capabilities.sudoAccess === 'passwordless')),
      new ShareItem('/dev/net/tun', availabilityLabel(capabilities.tunDevice), capabilityIcon(capabilities.tunDevice)),
      new ShareItem('tun2socks', availabilityLabel(capabilities.tun2socks), capabilityIcon(capabilities.tun2socks)),
      new ShareItem('ip command', availabilityLabel(capabilities.ipCommand), capabilityIcon(capabilities.ipCommand)),
      new ShareItem(
        'Recheck requirements',
        undefined,
        new vscode.ThemeIcon('refresh'),
        'localNetworkShare.checkAdvancedTunRequirements',
      ),
    ];
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

function availabilityLabel(available: boolean): string {
  return available ? 'Available' : 'Not detected';
}

function capabilityIcon(available: boolean): vscode.ThemeIcon {
  return new vscode.ThemeIcon(available ? 'pass-filled' : 'circle-slash');
}
