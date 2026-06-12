// Make sure that the pull request updated the version in the package.json
import axios from 'axios';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { lte } from 'semver';
import Git from 'simple-git';
import packageJson from '../package.json';

const origin = `origin/${process.env['GITHUB_BASE_REF']}`;

const ci = !!process.env['CI'];
if (ci) {
  console.log('::group::Starting Pre Check');
}
const log = {
  debug: (...message: unknown[]): void => console.debug(chalk.dim('>', ...message)),
  info: (...message: unknown[]): void => ci ? console.log(`::endgroup::\n::group::${message.shift()}\n`, ...message) : console.log(...message),
  warn: (...message: unknown[]): void => console.warn(`${ci ? '::warning::' : ''}${chalk.yellowBright(...message)}`),
  error: (...message: unknown[]): void => console.error(`${ci ? '::error::' : ''}${chalk.redBright(...message)}`),
  success: (...message: unknown[]): void => console.log(chalk.greenBright(...message)),
  notice: (...message: unknown[]): void => console.log(ci ? '::notice::' : '', chalk.cyanBright(...message)),
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


let success = true;
const summary = ['## Pre Check Summary:', ''];

async function checkBranch() {
  if (process.env['GITHUB_BASE_REF'] === 'main' && process.env['GITHUB_HEAD_REF'] !== 'beta') {
    log.error('Only the beta branch may merge into the main branch!');
    summary.push(`- [ ] Branch Check: Only the beta branch may merge into the main branch! (\`${process.env['GITHUB_BASE_REF']} === 'main' && ${process.env['GITHUB_HEAD_REF']} !== 'beta')\``);
    success = false;
  } else {
    summary.push(`- [x] Branch Check: Branches are compatible (\`${process.env['GITHUB_HEAD_REF']} --> ${process.env['GITHUB_BASE_REF']}\`)`);
  }
}
async function checkVersion() {
  const version = JSON.parse(await git.show(`${origin}:package.json`)).version;
  log.debug('Old version', version);
  log.debug('New version', packageJson.version);
  if (lte(packageJson.version, version)) {
    log.error('The version associated with this pull request is not greater than the previous version');
    summary.push(`- [ ] Version Check: \`v${version} <= v${packageJson.version}\``);
    success = false;
  } else if ((process.env['GITHUB_BASE_REF'] === 'main' && packageJson.version.includes('beta')) || (process.env['GITHUB_BASE_REF'] === 'beta' && !packageJson.version.includes('beta'))) {
    log.error('The version associated with this pull request does not match the branch');
    summary.push(`- [ ] Version Check: Branch does not match version \`${process.env['GITHUB_BASE_REF']} !== v${packageJson.version}\``);
    success = false;
  } else {
    summary.push(`- [x] Version Check: \`v${version} --> v${packageJson.version}\``);
  }
}
async function checkChangelog() {
  const oldChangelog = await git.show(`${origin}:CHANGELOG.md`).catch(() => {
    log.warn('The changelog is missing in the base branch');
  });
  log.debug('Old Changelog', oldChangelog);
  const changelog = await readFile('CHANGELOG.md', 'utf-8');
  log.debug('New Changelog', changelog);
  const changes = oldChangelog ? changelog.split('\n').slice(0, changelog.split('\n').length - oldChangelog.split('\n').length).join('\n') : changelog;
  log.info('Changelog changes', changes);
  if (!changes.length) {
    log.error('No changes have been made to the changelog');
    summary.push('- [ ] Changelog Check: No changes made to the changelog');
    success = false;
  } else {
    summary.push('- [x] Changelog Check: Changes made to the changelog');
    summary.push('## Changelog Preview:', ('\n' + changes).split('\n#').join('\n###'));
    namePullRequest(changes);
  }
}
(async () => {
  try {
    log.info('Checking the branch...');
    await checkBranch();
    log.info('Checking the version...');
    await checkVersion();
    log.info('Previewing the changelog...');
    await checkChangelog();
    if (success) {
      log.success('Pre-Check Passed');
      summary.unshift('# :white_check_mark: Pre-Check Passed :white_check_mark:');
    } else {
      log.error('Pre-Check Failed');
      summary.unshift('# :x: Pre-Check Failed :x:');
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      log.error('An error occurred during the pre-checks:', err);
      summary.push(`- [ ] An error occurred during the pre-checks: \`${err.message}\``);
    } else {
      log.error('An unknown error occurred during the pre-checks:', err);
      summary.push(`- [ ] An unknown error occurred during the pre-checks: \`${err}\``);
    }
  }
  log.info('Posting the summary...');
  await postSummary();
  if (ci) {
    console.log('::endgroup::');
  }
})();

async function namePullRequest(changes: string) {
  await github.patch(`/repos/${process.env['GITHUB_REPOSITORY']}/pulls/${process.env['GITHUB_REF_NAME']!.split('/')[0]}`, {
    title: packageJson.version,
    body: changes
  });
}

async function postSummary() {
  await github.post(`/repos/${process.env['GITHUB_REPOSITORY']}/issues/${process.env['GITHUB_REF_NAME']!.split('/')[0]}/comments`, {
    body: summary.join('\n')
  });
}
