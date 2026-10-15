import assert from 'node:assert/strict';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderReadme, updateReadme } from './update-stars.mjs';

test('badge appears at 0 → 1 and disappears at 1 → 0 without changing project text', async () => {
  const template = '- [VRI](https://github.com/zzxzzk115/VRI)<br>A rendering interface.\n';
  const zero = await renderReadme(template, async () => 0);
  const one = await renderReadme(template, async () => 1);
  const zeroAgain = await renderReadme(template, async () => 0);
  assert.ok(!zero.includes('![Stars]'));
  assert.match(one, /VRI\) !\[Stars\]\([^\n]+\)<br>A rendering interface\./);
  assert.equal(zeroAgain, zero);
  assert.ok(one.includes('https://img.shields.io/github/stars/zzxzzk115/VRI?style=social'));
});

test('main entries, More entries and PR links share the rule; supporting links and organizations stay untouched', async () => {
  const requests = [];
  const template = [
    '- [Example](https://github.com/example/project)<br>Based on [upstream](https://github.com/other/upstream).',
    '<details><summary>More</summary>',
    '- [Example again](https://github.com/Example/Project)',
    '- [Contribution](https://github.com/other/library/pull/42) — Open PR.',
    '- [Community](https://github.com/community)',
    '</details>',
  ].join('\n');
  const output = await renderReadme(template, async (name) => {
    requests.push(name.toLowerCase());
    return 2;
  });
  assert.deepEqual(requests.sort(), ['example/project', 'other/library']);
  assert.equal((output.match(/!\[Stars\]/g) || []).length, 3);
  assert.match(output, /library\/pull\/42\) !\[Stars\]/);
  assert.ok(output.includes('Based on [upstream](https://github.com/other/upstream).'));
  assert.ok(output.includes('[Community](https://github.com/community)\n'));
});

test('API failures preserve the existing README', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profile-stars-'));
  const templatePath = join(directory, 'README.template.md');
  const outputPath = join(directory, 'README.md');
  try {
    await writeFile(templatePath, '- [A](https://github.com/example/a)\n- [B](https://github.com/example/b)\n');
    await writeFile(outputPath, 'Existing reviewed profile.\n');
    await assert.rejects(updateReadme({
      templatePath,
      outputPath,
      getStars: async (name) => {
        if (name === 'example/b') throw new Error('GitHub unavailable');
        return 1;
      },
    }), /GitHub unavailable/);
    assert.equal(await readFile(outputPath, 'utf8'), 'Existing reviewed profile.\n');
  } finally {
    await unlink(templatePath);
    await unlink(outputPath);
    await rmdir(directory);
  }
});

test('missing counts fail instead of silently hiding a badge', async () => {
  await assert.rejects(
    renderReadme('- [VRI](https://github.com/zzxzzk115/VRI)', async () => undefined),
    /Invalid star count/,
  );
});
