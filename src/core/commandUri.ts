/** Keep literal percent escapes intact through VS Code's command-link decoding. */
export function commandUri(command: string, args: readonly unknown[]): string {
  // The command opener decodes the query again after URI parsing. JSON escapes
  // prevent that second pass from changing encoded repository IDs or filenames.
  const query = JSON.stringify(args).replace(/%/g, '\\u0025');
  const encoded = encodeURIComponent(query).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `command:${command}?${encoded}`;
}
