import { readFileSync } from 'node:fs';

const files = ['package.json', 'tsconfig.json', '.eslintrc.json', 'vercel.json'];
let hasError = false;

for (const file of files) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    console.log(`OK: ${file}`);
  } catch (error) {
    hasError = true;
    console.error(`INVALID JSON: ${file}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (hasError) {
  process.exit(1);
}
