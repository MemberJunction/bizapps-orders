import { simpleGit } from 'simple-git';
import { execSync } from 'child_process';
import fs from 'fs';

const git = simpleGit();

// Step 1: Merge main into next
console.log('Fetching and merging main branch...');
await git.fetch('origin', 'main');
await git.merge(['-X', 'theirs', 'origin/main']);

// Step 2: Update package-lock.json with new versions
console.log('\nUpdating package-lock.json with new package versions...');
try {
  execSync('npm install --package-lock-only', { stdio: 'inherit' });

  const status = await git.status();
  const lockFileModified = status.modified.includes('package-lock.json') ||
                          status.not_added.includes('package-lock.json');

  if (lockFileModified) {
    console.log('package-lock.json has been updated with new versions');

    const entitiesPkg = JSON.parse(fs.readFileSync('packages/Entities/package.json', 'utf8'));
    const version = entitiesPkg.version;

    await git.add('package-lock.json');
    await git.commit(
      `chore: Update package-lock.json with v${version} dependencies\n\n` +
      `Updates @mj-sample-app/* package versions in lock file after publishing v${version}`
    );
    console.log('Committed package-lock.json updates');
  } else {
    console.log('No changes to package-lock.json needed');
  }
} catch (error) {
  console.error('Error updating package-lock.json:', error);
  console.log('Continuing despite package-lock.json update error...');
}

// Step 3: Push to next
console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log('Successfully merged main and updated package-lock.json in next branch');
