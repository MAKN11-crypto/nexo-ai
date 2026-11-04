import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const destination = path.resolve('desktop/update-config.json');
const fullName = String(process.env.GITHUB_REPOSITORY || '').trim();
let config = { owner: '', repo: '', repository: '' };

if (fullName) {
  const match = fullName.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error('GITHUB_REPOSITORY debe tener el formato owner/repo.');
  config = { owner: match[1], repo: match[2], repository: `https://github.com/${match[1]}/${match[2]}` };
}

await writeFile(destination, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(config.repository ? `Actualizaciones incluidas desde ${config.repository}.` : 'Paquete local sin repositorio de actualizaciones configurado.');
