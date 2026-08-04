import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('inventory audit rejects a prohibited direct write', () => {
  const root = mkdtempSync(join(tmpdir(), 'inventory-audit-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'prohibited.ts'), "setDoc(doc(db, 'vendors', vendorId, 'branch_inventory', id), { quantity: 1 });\n");
    assert.throws(() => execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/audit-inventory-writes.ps1'), '-RootPath', root,
    ], { encoding: 'utf8', stdio: 'pipe' }), (error: { status?: number; stdout?: string }) => {
      assert.equal(error.status, 1);
      assert.match(error.stdout ?? '', /PROHIBITED_DIRECT_WRITE/);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
