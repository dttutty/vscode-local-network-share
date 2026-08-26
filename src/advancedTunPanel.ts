import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { RemoteCapabilities } from './remoteCapabilities';
import { createTunSetupPlan, validateTunSetupOptions } from './tunSettings';

export interface AdvancedTunPanelState {
  sharingActive: boolean;
  checking: boolean;
  target?: string;
  socksPort: number;
  capabilities?: RemoteCapabilities;
  error?: string;
}

export interface AdvancedTunPanelCallbacks {
  startSharing(): Promise<void>;
  checkRequirements(): Promise<void>;
}

export class AdvancedTunPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private state: AdvancedTunPanelState;

  constructor(
    state: AdvancedTunPanelState,
    private readonly callbacks: AdvancedTunPanelCallbacks,
    onDispose: () => void,
  ) {
    this.state = state;
    this.panel = vscode.window.createWebviewPanel(
      'localNetworkShare.advancedTunSetup',
      'Advanced TUN Setup',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.iconPath = new vscode.ThemeIcon('server-environment');
    this.panel.webview.html = this.createHtml();
    this.disposables.push(
      this.panel.onDidDispose(() => {
        onDispose();
        this.dispose();
      }),
      this.panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message)),
    );
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.One);
  }

  update(state: AdvancedTunPanelState): void {
    this.state = state;
    void this.panel.webview.postMessage({ type: 'state', state });
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const typed = message as { type: unknown; options?: unknown };
    try {
      if (typed.type === 'startSharing') {
        await this.callbacks.startSharing();
      } else if (typed.type === 'checkRequirements') {
        await this.callbacks.checkRequirements();
      } else if (typed.type === 'copyPlan') {
        const options = validateTunSetupOptions(typed.options);
        const plan = createTunSetupPlan(options, {
          target: this.state.target,
          socksPort: this.state.socksPort,
        });
        await vscode.env.clipboard.writeText(plan);
        void this.panel.webview.postMessage({ type: 'notice', message: 'Setup plan copied to the clipboard.' });
      }
    } catch (error) {
      void this.panel.webview.postMessage({
        type: 'notice',
        error: true,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createHtml(): string {
    const nonce = randomBytes(16).toString('base64');
    const initialState = JSON.stringify(this.state).replace(/</gu, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Advanced TUN Setup</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 32px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 880px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 26px; }
    h2 { margin: 0 0 16px; font-size: 16px; }
    p { line-height: 1.55; }
    .subtitle { margin: 0 0 24px; color: var(--vscode-descriptionForeground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .card { padding: 20px; border: 1px solid var(--vscode-widget-border); border-radius: 8px; background: var(--vscode-sideBar-background); }
    .danger { border-color: var(--vscode-inputValidation-warningBorder); background: var(--vscode-inputValidation-warningBackground); }
    .danger strong { color: var(--vscode-inputValidation-warningForeground); }
    .requirements { display: grid; gap: 10px; }
    .requirement { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--vscode-widget-border); }
    .requirement:last-child { border-bottom: 0; }
    .status { font-size: 12px; white-space: nowrap; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .missing { color: var(--vscode-testing-iconFailed); }
    .unknown { color: var(--vscode-descriptionForeground); }
    label { display: block; margin: 14px 0 6px; font-weight: 600; }
    select, input[type='text'], input[type='number'] { box-sizing: border-box; width: 100%; padding: 7px 9px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 2px; }
    select:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .checkbox { display: flex; gap: 9px; align-items: flex-start; font-weight: 400; }
    .checkbox input { margin-top: 3px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    button { padding: 7px 14px; border: 0; border-radius: 2px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .wide { margin-top: 16px; }
    .note { padding: 12px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); }
    .global-warning { display: none; margin-top: 10px; color: var(--vscode-testing-iconFailed); }
    .notice { min-height: 20px; margin-top: 12px; color: var(--vscode-descriptionForeground); }
    .notice.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <main>
    <h1>Advanced TUN Setup</h1>
    <p class="subtitle">A guided planning page for applications that cannot use SOCKS5 or HTTP proxy settings.</p>

    <section class="card danger">
      <strong>⚠ This can interrupt SSH access.</strong>
      <p>Continue only when you can physically access the server or recover it through BMC, IPMI, iDRAC, or iLO.</p>
      <label class="checkbox"><input id="safety" type="checkbox"> <span>I understand the risk and have physical or out-of-band recovery access.</span></label>
    </section>

    <div class="grid wide">
      <section class="card">
        <h2>1. Server readiness</h2>
        <p id="connectionStatus" class="subtitle"></p>
        <div id="requirements" class="requirements"></div>
        <div class="actions">
          <button id="startSharing">Start sharing</button>
          <button id="check" class="secondary">Check again</button>
        </div>
      </section>

      <section class="card">
        <h2>2. Setup options</h2>
        <label for="routing">Routing isolation</label>
        <select id="routing">
          <option value="namespace">Isolated network namespace (Recommended)</option>
          <option value="global">Global host routing (High risk)</option>
        </select>
        <p id="globalWarning" class="global-warning">Global routing can break the current SSH connection and affect other users.</p>

        <label for="interfaceName">TUN interface name</label>
        <input id="interfaceName" type="text" value="tun0" maxlength="15">

        <label for="mtu">MTU</label>
        <input id="mtu" type="number" value="1500" min="576" max="9000">

        <label for="dns">DNS handling</label>
        <select id="dns">
          <option value="preserve">Keep current server DNS (Recommended)</option>
          <option value="tunnel">Route DNS through the tunnel (Advanced)</option>
        </select>
      </section>
    </div>

    <section class="card wide">
      <h2>3. Review</h2>
      <p class="note">This version prepares and copies a reviewable setup plan. It does not request a sudo password or automatically create an interface, change routes, or alter DNS.</p>
      <div class="actions"><button id="copyPlan" disabled>Copy setup plan</button></div>
      <div id="notice" class="notice" role="status"></div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${initialState};
    const requirements = [
      ['Administrator access', value => value && (value.sudoAccess === 'member' || value.sudoAccess === 'passwordless')],
      ['TUN device support', value => value && value.tunDevice],
      ['Proxy helper (tun2socks)', value => value && value.tun2socks],
      ['Networking tools', value => value && value.ipCommand],
    ];
    const safety = document.getElementById('safety');
    const copyPlan = document.getElementById('copyPlan');
    const routing = document.getElementById('routing');
    const globalWarning = document.getElementById('globalWarning');

    function render(next) {
      state = next;
      document.getElementById('connectionStatus').textContent = state.sharingActive
        ? 'Sharing with ' + (state.target || 'the selected server') + ' through SOCKS5 port ' + state.socksPort + '.'
        : 'Start sharing before checking the remote server.';
      document.getElementById('startSharing').style.display = state.sharingActive ? 'none' : '';
      const check = document.getElementById('check');
      check.disabled = !state.sharingActive || state.checking;
      check.textContent = state.checking ? 'Checking…' : 'Check again';
      const container = document.getElementById('requirements');
      container.replaceChildren(...requirements.map(([label, test]) => {
        const row = document.createElement('div');
        row.className = 'requirement';
        const name = document.createElement('span');
        name.textContent = label;
        const status = document.createElement('span');
        const known = Boolean(state.capabilities);
        const passed = known && test(state.capabilities);
        status.className = 'status ' + (known ? (passed ? 'ok' : 'missing') : 'unknown');
        status.textContent = known ? (passed ? 'Ready' : 'Needs attention') : 'Not checked';
        row.append(name, status);
        return row;
      }));
      if (state.error) showNotice(state.error, true);
    }

    function showNotice(message, error = false) {
      const notice = document.getElementById('notice');
      notice.textContent = message;
      notice.className = 'notice' + (error ? ' error' : '');
    }

    function updateControls() {
      copyPlan.disabled = !safety.checked;
      globalWarning.style.display = routing.value === 'global' ? 'block' : 'none';
    }

    safety.addEventListener('change', updateControls);
    routing.addEventListener('change', updateControls);
    document.getElementById('startSharing').addEventListener('click', () => vscode.postMessage({ type: 'startSharing' }));
    document.getElementById('check').addEventListener('click', () => vscode.postMessage({ type: 'checkRequirements' }));
    copyPlan.addEventListener('click', () => vscode.postMessage({
      type: 'copyPlan',
      options: {
        routingMode: routing.value,
        interfaceName: document.getElementById('interfaceName').value,
        mtu: Number(document.getElementById('mtu').value),
        dnsMode: document.getElementById('dns').value,
      },
    }));
    window.addEventListener('message', event => {
      if (event.data?.type === 'state') render(event.data.state);
      if (event.data?.type === 'notice') showNotice(event.data.message, Boolean(event.data.error));
    });
    render(state);
    updateControls();
  </script>
</body>
</html>`;
  }
}
