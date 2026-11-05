import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const outputDirectory = path.resolve('dist');
const files = await readdir(outputDirectory);

async function describe(filename) {
  const absolutePath = path.join(outputDirectory, filename);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return { url: filename, sha512: hash.digest('base64'), size: (await stat(absolutePath)).size };
}

async function writeManifest(filename, artifact) {
  const info = await describe(artifact);
  const publishedArtifact = artifact.replaceAll(' ', '.');
  const data = [
    `version: ${JSON.stringify(process.env.npm_package_version || '0.1.0')}`,
    'files:',
    `  - url: ${JSON.stringify(publishedArtifact)}`,
    `    sha512: ${info.sha512}`,
    `    size: ${info.size}`,
    `path: ${JSON.stringify(publishedArtifact)}`,
    `sha512: ${info.sha512}`,
    `releaseDate: ${new Date().toISOString()}`,
    '',
  ].join('\n');
  await writeFile(path.join(outputDirectory, filename), data);
  console.log(`Update manifest created: ${filename} → ${artifact}`);
}

const windowsInstaller = files.find((name) => /^Bit by Orbit Setup .*\.exe$/i.test(name));
const macArchive = files.find((name) => /^Bit by Orbit-.*-mac\.zip$/i.test(name));
const linuxPackage = files.find((name) => /\.AppImage$/i.test(name));

if (windowsInstaller) await writeManifest('latest.yml', windowsInstaller);
if (macArchive) await writeManifest('latest-mac.yml', macArchive);
if (linuxPackage) await writeManifest('latest-linux.yml', linuxPackage);
if (!windowsInstaller && !macArchive && !linuxPackage) {
  console.log('No auto-update artifact found. NSIS Windows installer or signed macOS ZIP is needed.');
}
