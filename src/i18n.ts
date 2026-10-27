import * as vscode from 'vscode';
export const isChinese = vscode.env.language.toLowerCase().startsWith('zh');
export function t(en: string, zh: string, ...values: (string | number)[]): string {
  return (isChinese ? zh : en).replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
