export const REMOTE_SSH_EXTENSION_ID = 'ms-vscode-remote.remote-ssh';
export const MINIMUM_REMOTE_SSH_VERSION = '0.126.0';

export function isVersionAtLeast(version: string, minimum: string): boolean {
  const currentParts = parseVersion(version);
  const minimumParts = parseVersion(minimum);
  if (!currentParts || !minimumParts) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] !== minimumParts[index]) {
      return currentParts[index] > minimumParts[index];
    }
  }
  return true;
}

function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(version.trim());
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
