import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyPagesCsp } from '../scripts/pages-csp.mjs';

test('only studio pages may use configured country and contact endpoints', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'visionoir-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'frequency'));
  const source = (body = '') =>
    '<!doctype html><html><head>\n<meta charset="utf-8"></head><body>' + body + '</body></html>';
  const fakeContact = 'https://example.invalid/studio/inquiries';
  await writeFile(
    join(root, 'index.html'),
    source(
      '<script type="application/json" id="site-config">' +
        JSON.stringify({
          contactEndpoint: fakeContact,
          geoEndpoint: 'https://country.example.invalid/country',
        }) +
        '</script>',
    ),
  );
  await writeFile(join(root, 'frequency/index.html'), source());
  assert.equal(await applyPagesCsp(root), 2);
  const studio = await readFile(join(root, 'index.html'), 'utf8'),
    frequency = await readFile(join(root, 'frequency/index.html'), 'utf8');
  assert.match(studio, /form-action https:\/\/example\.invalid\/studio\/inquiries;/);
  assert.match(
    studio,
    /connect-src 'self' blob: https:\/\/country\.example\.invalid https:\/\/example\.invalid\/studio\/inquiries/,
  );
  assert.match(frequency, /form-action 'none'/);
  assert.ok(!frequency.includes('example.invalid'));
  assert.match(frequency, /script-src 'self';/);
  assert.ok(frequency.indexOf('<meta charset') < frequency.indexOf('Content-Security-Policy'));
  assert.ok(frequency.indexOf('Content-Security-Policy') < frequency.indexOf('</head>'));
  await applyPagesCsp(root);
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), studio);
  const apps = 'https://script.google.com/macros/s/test-id/exec';
  await writeFile(
    join(root, 'index.html'),
    source(
      '<script type="application/json" id="site-config">' +
        JSON.stringify({ contactEndpoint: apps }) +
        '</script>',
    ),
  );
  await applyPagesCsp(root);
  assert.ok(
    (await readFile(join(root, 'index.html'), 'utf8')).includes(
      "connect-src 'self' blob: " + apps + ' https://script.googleusercontent.com/macros/echo',
    ),
  );
  assert.ok(!(await readFile(join(root, 'frequency/index.html'), 'utf8')).includes('googleusercontent.com'));
});
