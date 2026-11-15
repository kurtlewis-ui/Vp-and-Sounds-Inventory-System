import { execFileSync } from 'child_process';
import { resolve } from 'path';

describe('Disposal selling snapshot migration', () => {
  it('preserves cost/history and freezes branch/parent selling valuations', () => {
    // Run WASM PostgreSQL outside Jest VM so PGlite can use native dynamic imports.
    const output = execFileSync(process.execPath, [resolve(__dirname, '../../../scripts/test-disposal-snapshot.cjs')], { encoding: 'utf8', timeout: 30000 });
    expect(output).toContain('PASS: selling snapshot migration');
  }, 35000);
});
