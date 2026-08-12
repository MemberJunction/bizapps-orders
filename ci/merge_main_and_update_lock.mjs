import { simpleGit } from 'simple-git';
import { execSync } from 'child_process';
import fs from 'fs';

const git = simpleGit();

// Step 1: Merge main into next
console.log('Fetching and merging main branch...');
await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

// Step 2: Update pnpm-lock.yaml with new versions
console.log('\nUpdating pnpm-lock.yaml with new package versions...');
try {
  // --lockfile-only resolves and rewrites the lockfile without touching
  // node_modules — the pnpm equivalent of npm's --package-lock-only.
  execSync('pnpm install --lockfile-only', { stdio: 'inherit' });

  const status = await git.status();
  const lockFileModified = status.modified.includes('pnpm-lock.yaml') ||
                          status.not_added.includes('pnpm-lock.yaml');

  if (lockFileModified) {
    console.log('pnpm-lock.yaml has been updated with new versions');

    const entitiesPkg = JSON.parse(fs.readFileSync('packages/Entities/package.json', 'utf8'));
    const version = entitiesPkg.version;

    await git.add('pnpm-lock.yaml');
    await git.commit(
      `chore: Update pnpm-lock.yaml with v${version} dependencies\n\n` +
      `Updates @mj-biz-apps/* package versions in lock file after publishing v${version}`
    );
    console.log('Committed pnpm-lock.yaml updates');
  } else {
    console.log('No changes to pnpm-lock.yaml needed');
  }
} catch (error) {
  console.error('Error updating pnpm-lock.yaml:', error);
  console.log('Continuing despite pnpm-lock.yaml update error...');
}

// Step 3: Push to next
console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log('Successfully merged main and updated pnpm-lock.yaml in next branch');
