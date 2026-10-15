import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const generatedNotice = '<!-- Generated from README.template.md. Edit the template, then run: node scripts/update-stars.mjs -->\n\n';

// Only decorate the first repository link in a project bullet, not its references.
function projectPattern() {
  return /^(?<link>[ \t]*-[ \t]+\[[^\]\r\n]+\]\(https:\/\/github\.com\/(?<owner>[A-Za-z0-9-]+)\/(?<repo>[A-Za-z0-9_.-]+)(?:\/[^)\r\n]*)?\))(?:[ \t]+!\[Stars\]\(https:\/\/img\.shields\.io\/github\/stars\/[^)\r\n]+\))?/gm;
}

function repositories(template) {
  const names = new Map();
  for (const match of template.matchAll(projectPattern())) {
    const name = `${match.groups.owner}/${match.groups.repo}`;
    names.set(name.toLowerCase(), name);
  }
  return [...names.values()];
}

export async function fetchStars(repository) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'zzxzzk115-profile-stars',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com/repos/${repository}`, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status} for ${repository}`);
  }
  const metadata = await response.json();
  if (metadata.private) throw new Error(`Expected a public repository: ${repository}`);
  return metadata.stargazers_count;
}

export async function renderReadme(template, getStars = fetchStars) {
  const counts = new Map();
  const names = repositories(template);

  // Keep requests bounded; fetch every count before generating or writing output.
  for (let i = 0; i < names.length; i += 4) {
    const batch = await Promise.all(names.slice(i, i + 4).map(async (name) => {
      const count = await getStars(name);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Invalid star count for ${name}`);
      }
      return [name.toLowerCase(), count];
    }));
    for (const [name, count] of batch) counts.set(name, count);
  }

  const body = template.replace(projectPattern(), (...args) => {
    const { link, owner, repo } = args.at(-1);
    const name = `${owner}/${repo}`;
    return counts.get(name.toLowerCase()) > 0
      ? `${link} ![Stars](https://img.shields.io/github/stars/${name}?style=social)`
      : link;
  });
  return generatedNotice + body;
}

export async function updateReadme({
  templatePath = join(root, 'README.template.md'),
  outputPath = join(root, 'README.md'),
  getStars = fetchStars,
} = {}) {
  const template = (await readFile(templatePath, 'utf8')).replaceAll('\r\n', '\n');
  const next = await renderReadme(template, getStars);
  const previous = await readFile(outputPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (next === previous) return false;
  await writeFile(outputPath, next);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  updateReadme()
    .then((changed) => console.log(changed ? 'Updated README star badges.' : 'README is unchanged.'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
