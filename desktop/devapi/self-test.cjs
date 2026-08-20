const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function runLocalSelfTest(runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devapi-selftest-'));
  const checks = [];
  const push = (id, ok, detail = null) => checks.push({ id, state: ok ? 'PASS' : 'FAILED', ...(detail ? { detail: String(detail).slice(0, 500) } : {}) });
  try {
    const dbPath = path.join(root, 'self.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO t(value) VALUES ('ok');");
    const sqliteOk = db.prepare('SELECT value FROM t WHERE id=1').get()?.value === 'ok';
    db.close();
    push('sqlite-roundtrip', sqliteOk);

    const scoped = path.resolve(root, 'safe.txt');
    const escaped = path.resolve(root, '..', 'escape.txt');
    push('path-confinement', scoped.startsWith(path.resolve(root) + path.sep) && !escaped.startsWith(path.resolve(root) + path.sep));

    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    const run = async (args, id, cwd = repo) => {
      const result = await runtime.spawnCapture('git', args, { cwd, timeoutMs: 20_000 });
      push(id, result.exitCode === 0, result.exitCode === 0 ? null : result.stderr || result.stdout);
      if (result.exitCode !== 0) throw new Error(`SELFTEST_${id.toUpperCase().replace(/-/g, '_')}_FAILED`);
      return result;
    };
    await run(['init'], 'git-init');
    await run(['config','user.email','devapi-selftest@invalid.local'], 'git-config-email');
    await run(['config','user.name','DevAPI SelfTest'], 'git-config-name');
    fs.writeFileSync(path.join(repo, 'README.md'), '# DevAPI self-test\n', 'utf8');
    await run(['add','README.md'], 'git-add');
    await run(['commit','-m','self-test'], 'git-commit');
    const wt = path.join(root, 'worktree');
    await run(['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], 'git-worktree-add', root);
    push('git-worktree-readback', fs.readFileSync(path.join(wt, 'README.md'), 'utf8') === '# DevAPI self-test\n');
    await runtime.spawnCapture('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { timeoutMs: 20_000 }).catch(() => null);

    const state = checks.every((item) => item.state === 'PASS') ? 'RUNTIME_VERIFIED' : 'FAILED';
    return { state, checks, checkedAt: new Date().toISOString() };
  } catch (error) {
    push('exception', false, error?.message || error);
    return { state: 'FAILED', checks, checkedAt: new Date().toISOString() };
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

module.exports = { runLocalSelfTest };
