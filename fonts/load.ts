import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function firstExisting(candidates: string[], label: string): string {
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Bundled font not found: ${label}`);
  return found;
}

/** Paths to fonts shipped in this repo. Literal joins so the serverless trace keeps the files. */
export function bundledFontPath(name: 'regular' | 'bold' | 'italic'): string {
  if (name === 'bold') {
    return firstExisting(
      [
        path.join(moduleDir, 'LiberationSans-Bold.ttf'),
        path.join(process.cwd(), 'fonts', 'LiberationSans-Bold.ttf'),
      ],
      'LiberationSans-Bold.ttf'
    );
  }
  if (name === 'italic') {
    return firstExisting(
      [
        path.join(moduleDir, 'LiberationSans-Italic.ttf'),
        path.join(process.cwd(), 'fonts', 'LiberationSans-Italic.ttf'),
      ],
      'LiberationSans-Italic.ttf'
    );
  }
  return firstExisting(
    [
      path.join(moduleDir, 'LiberationSans-Regular.ttf'),
      path.join(process.cwd(), 'fonts', 'LiberationSans-Regular.ttf'),
    ],
    'LiberationSans-Regular.ttf'
  );
}
