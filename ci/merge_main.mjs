import { simpleGit } from 'simple-git';

const git = simpleGit();

console.log('Fetching main branch...');
await git.fetch('origin', 'main');

console.log('Merging main into current branch (next)...');
await git.merge(['-X', 'theirs', 'origin/main']);

console.log('\nPushing to origin/next...');
await git.push('origin', 'HEAD:next');

console.log('Successfully merged main into next');
