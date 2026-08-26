import Module from 'node:module';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;

Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { AdvancedTunViewContent } = require('../out/advancedTunView.js');
  const { ShareViewProvider } = require('../out/shareView.js');

  const advanced = new AdvancedTunViewContent(
    {
      workflowStage: 'check',
      sharingActive: false,
      checking: false,
      socksPort: 17890,
    },
    {
      closeView: async () => {},
      startSharing: async () => {},
      stopSharing: async () => {},
      checkRequirements: async () => {},
    },
  );
  const share = new ShareViewProvider(advanced);

  validateInlineScripts('Basic mode', share.createHtml());
  validateInlineScripts('TUN mode', advanced.createHtml());
  process.stdout.write('Webview inline scripts are syntactically valid.\n');
} finally {
  Module._load = originalLoad;
}

function validateInlineScripts(name, html) {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)];
  if (scripts.length === 0) {
    throw new Error(`${name} did not contain an inline script.`);
  }
  for (const [, script] of scripts) {
    try {
      Function(script);
    } catch (error) {
      throw new Error(`${name} Webview script is invalid: ${error.message}`, { cause: error });
    }
  }
}
