import { rm } from 'node:fs/promises';
import { join } from 'node:path';

async function globalSetup() {
  await rm(join(process.cwd(), 'allure-results', 'e2e'), { recursive: true, force: true });
}

export default globalSetup;
