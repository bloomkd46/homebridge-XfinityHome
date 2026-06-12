/* eslint-disable @typescript-eslint/ban-ts-comment */
// Make sure that the pull request updated the version in the package.json
import axios from 'axios';
//@ts-ignore - chalk isn't broken yet at v4
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import Git from 'simple-git';
//@ts-ignore - This is addressed in the compiler options
import packageJson from '../package.json';

const origin = process.env['BEFORE'];

const ci = !!process.env['CI'];
const log = {
  debug: (...message: unknown[]): void => console.debug(chalk.dim('>', ...message)),
  info: (...message: unknown[]): void => console.log(...message),
  warn: (...message: unknown[]): void => console.warn(`${ci ? '::warning::' : ''}${chalk.yellowBright(...message)}`),
  error: (...message: unknown[]): void => console.error(`${ci ? '::error::' : ''}${chalk.redBright(...message)}`),
  success: (...message: unknown[]): void => console.log(chalk.greenBright(...message))
};
if (!ci) {
  log.error('This workflow may only be run by a pull request!');
  process.exit(1);
}
const git = Git();
const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${process.env['GITHUB_TOKEN']}`,
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

async function getChanges() {
  const oldChangelog = await git.show(`${origin}:CHANGELOG.md`).catch(() => {
    log.warn('The changelog is missing in the base branch');
  });
  log.debug('Old Changelog', oldChangelog);
  const changelog = await readFile('CHANGELOG.md', 'utf-8');
  log.debug('New Changelog', changelog);
  const changes = oldChangelog ? changelog.split('\n').slice(0, changelog.split('\n').length - oldChangelog.split('\n').length).join('\n') : changelog;
  log.info('Changelog changes', changes);
  return changes;
}

(async (): Promise<void> => {
  log.info('Getting version');
  const version = `v${packageJson.version}`;
  log.debug('Version:', version);
  log.info('Getting changes');
  const changes = await getChanges();
  log.debug('Changes:', changes);
  log.info('Publishing Release');
  await github.post(`/repos/${process.env['GITHUB_REPOSITORY']}/releases`, {
    body: process.env['GITHUB_REF_NAME'] === 'main' ? `# ${version}\n${changes}` : changes,
    draft: false,
    tag_name: version,
    name: version,
    prerelease: process.env['GITHUB_REF_NAME'] === 'beta',
    target_commitish: process.env['GITHUB_SHA']
  });
  log.success('Published release');
})();
