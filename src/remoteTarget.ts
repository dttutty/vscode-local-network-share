export function parseRemoteSshTarget(authority: string): string | undefined {
  const prefix = 'ssh-remote+';
  if (!authority.startsWith(prefix)) {
    return undefined;
  }

  const encodedTarget = authority.slice(prefix.length);
  if (!encodedTarget) {
    return undefined;
  }

  const decodedTarget = safeDecodeURIComponent(encodedTarget);
  const jsonTarget = tryParseHexEncodedAuthority(decodedTarget);
  return sanitizeTarget(jsonTarget ?? decodedTarget);
}

export function sanitizeTarget(value: string): string | undefined {
  const target = value.trim();
  if (!target || target.startsWith('-') || /[\u0000-\u001f\u007f]/u.test(target)) {
    return undefined;
  }
  return target;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tryParseHexEncodedAuthority(value: string): string | undefined {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(value)) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(value, 'hex').toString('utf8');
    const parsed = JSON.parse(decoded) as { hostName?: unknown; host?: unknown };
    if (typeof parsed.hostName === 'string') {
      return parsed.hostName;
    }
    if (typeof parsed.host === 'string') {
      return parsed.host;
    }
  } catch {
    // A valid SSH alias may itself happen to contain only hexadecimal digits.
  }
  return undefined;
}
