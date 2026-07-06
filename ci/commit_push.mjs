import { simpleGit } from 'simple-git';

const git = simpleGit();
const version = process.env.VERSION;

console.log('Staging and committing version bump...');
await git.add('./*').commit('Version Packages [skip ci]');

console.log('\nPushing to origin/main...');
await git.push('origin', 'HEAD:main');

if (version) {
  console.log(`\nCreating and pushing tag: ${version}`);
  await git.addTag(version);
  await git.push('origin', `refs/tags/${version}`);
  console.log(`Successfully tagged ${version}`);
}
