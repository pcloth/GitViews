import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const files = (await readdir('test')).filter(f => f.endsWith('.test.ts')).map(f => `test/${f}`);
await build({ entryPoints: files, bundle: true, platform: 'node', format: 'cjs', target: 'node20', outdir: '.test-out', alias: { vscode: './test/vscodeMock.ts' } });
const child = spawn(process.execPath, ['--test', ...files.map(f => f.replace('test/', '.test-out/').replace(/\.ts$/, '.js'))], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
