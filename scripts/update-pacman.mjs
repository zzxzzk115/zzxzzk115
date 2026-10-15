import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Pin the upstream renderer so previews and scheduled runs use the same code.
// https://github.com/abozanona/pacman-contribution-graph
const revision = '7332e1de7903ab780c3692a4127a59cc13872daa';
const integrity = 'cf182ee29d0e2bb65f961861fc5ab07585b2b3c54ca34421d4aac8c8dcf1c4f0';
const source = `https://raw.githubusercontent.com/abozanona/pacman-contribution-graph/${revision}/dist/pacman-contribution-graph.min.js`;
const output = new URL('../assets/', import.meta.url);

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN to read the contribution calendar.');

  const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Renderer download failed: HTTP ${response.status}`);
  const code = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(code).digest('hex') !== integrity) {
    throw new Error('Renderer checksum does not match the pinned version.');
  }
  const { ArcadeRenderer } = await import(`data:text/javascript;base64,${code.toString('base64')}`);

  const images = [];
  for (const [theme, filename] of [
    ['github', 'pacman-contribution-graph.svg'],
    ['github-dark', 'pacman-contribution-graph-dark.svg'],
  ]) {
    let svg;
    const renderer = new ArcadeRenderer({
      game: 'pacman',
      platform: 'github',
      username: process.env.GITHUB_REPOSITORY_OWNER || 'zzxzzk115',
      gameTheme: theme,
      playerStyle: 'opportunistic',
      showMonthLabels: true,
      githubSettings: { accessToken: token },
      svgCallback: (result) => { svg = result; },
    });
    await renderer.start();
    if (typeof svg !== 'string' || !svg.includes('<svg') || !svg.includes('<animate')) {
      throw new Error(`The renderer did not produce an animated SVG for ${theme}.`);
    }
    images.push([filename, svg.replace(/[ \t]+$/gm, '')]);
  }

  // Generate and validate both themes before replacing the previous images.
  await mkdir(output, { recursive: true });
  for (const [filename, svg] of images) {
    const target = new URL(filename, output);
    await writeFile(target, svg);
    console.log(`Updated ${fileURLToPath(target)} (${Buffer.byteLength(svg)} bytes).`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
