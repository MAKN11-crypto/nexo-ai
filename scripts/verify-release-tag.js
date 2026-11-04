import { readFile } from 'node:fs/promises';

const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = String(process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
if (tag && tag !== packageInfo.version) {
  throw new Error(`La etiqueta v${tag} no coincide con la versión ${packageInfo.version} de package.json.`);
}
