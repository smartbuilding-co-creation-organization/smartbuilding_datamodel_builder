import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { getOutputPlugins } from '@repo/core';
import { runCli, Writer } from '../src/index';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VALID_CSV = resolve(REPO_ROOT, 'packages/fixtures/valid.csv');
const INVALID_CSV = resolve(REPO_ROOT, 'packages/fixtures/invalid.csv');

function makeIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: { write: (chunk: string) => stdout.push(chunk) } satisfies Writer,
      stderr: { write: (chunk: string) => stderr.push(chunk) } satisfies Writer,
    },
    stdout,
    stderr,
  };
}

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('runCli', () => {
  it.each(['CSV', 'JSON-LD', 'YAML'])(
    'produces non-empty output for --format %s',
    async (format) => {
      const { io, stdout } = makeIo();
      const code = await runCli(['--input', VALID_CSV, '--format', format], io);
      expect(code).toBe(0);
      expect(stdout.join('')).not.toHaveLength(0);
    },
  );

  it('produces Turtle output for --format RDF --serializer Turtle', async () => {
    const { io, stdout } = makeIo();
    const code = await runCli(
      ['--input', VALID_CSV, '--format', 'RDF', '--serializer', 'Turtle'],
      io,
    );
    expect(code).toBe(0);
    expect(stdout.join('')).toContain('@prefix');
  });

  it('errors when a format has multiple serializers and none is given', async () => {
    const { io, stderr } = makeIo();
    const code = await runCli(['--input', VALID_CSV, '--format', 'DTDL'], io);
    expect(code).toBe(2);
    expect(stderr.join('')).toMatch(/multiple serializers/);
    expect(stderr.join('')).toMatch(/Interfaces/);
  });

  it('lists all registered plugins with --list-formats', async () => {
    const { io, stdout } = makeIo();
    const code = await runCli(['--list-formats'], io);
    expect(code).toBe(0);
    const output = stdout.join('');
    for (const plugin of getOutputPlugins()) {
      expect(output).toContain(`--format ${plugin.format} --serializer ${plugin.serializer}`);
    }
  });

  it('prints structural validation warnings for a CSV with a duplicate id', async () => {
    const { io, stderr } = makeIo();
    const code = await runCli(['--input', INVALID_CSV, '--format', 'CSV'], io);
    expect(code).toBe(0);
    expect(stderr.join('')).toMatch(/id_duplicate/);
  });

  it('exits with code 2 when the input file does not exist', async () => {
    const { io, stderr } = makeIo();
    const code = await runCli(
      ['--input', resolve(REPO_ROOT, 'does-not-exist.csv'), '--format', 'CSV'],
      io,
    );
    expect(code).toBe(2);
    expect(stderr.join('')).toMatch(/Failed to read/);
  });

  it('writes output to a file when --out is given', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'repo-cli-test-'));
    const outPath = join(tmpDir, 'output.csv');
    tmpDirs.push(tmpDir);
    const { io } = makeIo();
    const code = await runCli(['--input', VALID_CSV, '--format', 'CSV', '--out', outPath], io);
    expect(code).toBe(0);
    const content = readFileSync(outPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});
