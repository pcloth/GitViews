import * as path from 'node:path';

/** Small extension-host adapter. UI/platform integration still requires VS Code. */
export class EventEmitter<T> {
  private handlers = new Set<(value: T) => unknown>();
  event = (handler: (value: T) => unknown) => { this.handlers.add(handler); return { dispose: () => this.handlers.delete(handler) }; };
  fire(value: T): void { this.handlers.forEach(handler => handler(value)); }
  dispose(): void { this.handlers.clear(); }
}
export class Uri {
  constructor(readonly scheme: string, readonly path: string, readonly query = '', readonly authority = '') {}
  get fsPath(): string { return this.path; }
  toString(): string { return `${this.scheme}://${this.authority}${encodeURI(this.path)}${this.query ? `?${encodeURIComponent(this.query)}` : ''}`; }
  static file(filename: string): Uri { return new Uri('file', filename); }
  static from(value: { scheme: string; path: string; query?: string; authority?: string }): Uri { return new Uri(value.scheme, value.path, value.query, value.authority); }
  static joinPath(base: Uri, ...parts: string[]): Uri { return new Uri(base.scheme, path.join(base.path, ...parts), base.query, base.authority); }
}
export class Range { constructor(readonly startLine: number, readonly startCharacter: number, readonly endLine: number, readonly endCharacter: number) {} }
export const env = { language: 'en', clipboard: { writeText: async (_text: string) => {} } };
export const calls: { id: string; args: unknown[] }[] = [];
export const commands = { executeCommand: async (id: string, ...args: unknown[]) => { calls.push({ id, args }); } };
export const workspace = {
  getConfiguration: () => ({ get: (name: string, fallback: unknown) => name === 'history.pageSize' ? 20 : fallback })
};
export const inputs: (string | undefined)[] = [];
export const warnings: string[] = [];
export const window = {
  activeTextEditor: undefined,
  showInputBox: async () => inputs.shift(),
  showQuickPick: async <T>(items: T[]) => items[0],
  showInformationMessage: async (message: string) => { warnings.push(message); return undefined; },
  showWarningMessage: async (message: string) => { warnings.push(message); return undefined; }
};

export interface ViewMessage {
  type: string; selected?: string; contextHash?: string; loading: boolean;
  commits: { hash: string }[]; details?: { commit: { hash: string }; files: { path: string }[] };
  comparison?: { base: string; target: string }; error: string;
}
export function createView() {
  const received = new EventEmitter<unknown>();
  const visibility = new EventEmitter<void>();
  const disposed = new EventEmitter<void>();
  const messages: ViewMessage[] = [];
  return {
    visible: true, messages, received, visibility, disposed,
    onDidChangeVisibility: visibility.event, onDidDispose: disposed.event,
    webview: {
      options: {}, html: '', cspSource: 'mock-resource:',
      asWebviewUri: (uri: Uri) => uri,
      onDidReceiveMessage: received.event,
      postMessage: async (value: ViewMessage) => { messages.push(structuredClone(value)); return true; }
    }
  };
}
