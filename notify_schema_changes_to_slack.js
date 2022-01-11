/**
 * Some of the code snippets used in this file is taken from:
 *      URL: https://github.com/kamilkisiela/graphql-inspector
 *      Version: v3.0.2
 */

const child_process = require('child_process');
const https = require('https')
const os = require('os')

const { diff, CriticalityLevel } = require('@graphql-inspector/core')
const { loadSchemaSync } = require('@graphql-tools/load')
const { GraphQLFileLoader } = require('@graphql-tools/graphql-file-loader')
const { GitLoader } = require('@graphql-tools/git-loader')

function quotesTransformer(msg, symbols = '**') {
  const findSingleQuotes = /\'([^']+)\'/gim;
  const findDoubleQuotes = /\"([^"]+)\"/gim;
  function transformm(_, value) {
      return `${symbols}${value}${symbols}`;
  }
  return msg
      .replace(findSingleQuotes, transformm)
      .replace(findDoubleQuotes, transformm);
}


function slackCoderize(msg) {
  return quotesTransformer(msg, '`');
}


function filterChangesByLevel(level) {
  return (change) => change.criticality.level === level;
}


function createAttachments(changes) {
  const breakingChanges = changes.filter(filterChangesByLevel(CriticalityLevel.Breaking));
  const dangerousChanges = changes.filter(filterChangesByLevel(CriticalityLevel.Dangerous));
  const safeChanges = changes.filter(filterChangesByLevel(CriticalityLevel.NonBreaking));
  const attachments = [];
  if (breakingChanges.length) {
      attachments.push(renderAttachments({
          color: '#E74C3B',
          title: 'Breaking changes',
          changes: breakingChanges,
      }));
  }
  if (dangerousChanges.length) {
      attachments.push(renderAttachments({
          color: '#F0C418',
          title: 'Dangerous changes',
          changes: dangerousChanges,
      }));
  }
  if (safeChanges.length) {
      attachments.push(renderAttachments({
          color: '#23B99A',
          title: 'Safe changes',
          changes: safeChanges,
      }));
  }
  return attachments;
}


function renderAttachments({ changes, title, color, }) {
  const text = changes
      .map((change) => slackCoderize(change.message))
      .join('\n');
  return {
      mrkdwn_in: ['text', 'fallback'],
      color,
      author_name: title,
      text,
      fallback: text,
  };
}


async function getCommitId(ref) {
    return await new Promise((resolve, reject) => {
        child_process.execFile('git', ['rev-parse', ref], { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 1024 }, (error, stdout) => {
            if (error) {
                reject(error)
            } else {
                resolve(stdout.trim().substr(0, 7))
            }
        })
    })
}


async function getGitCompare(repo) {

    const [ commit_from, commit_to ] = await Promise.all([
        getCommitId(repo.main_branch),
        getCommitId('HEAD'),
    ])

    return {
        url: `${repo.url}/compare/${commit_from}...${commit_to}`,
        commit: commit_to,
    }

}


async function notifySlack(webhook, repo, changes) {

    const compare = await getGitCompare(repo)

    const payload = JSON.stringify({
        username: 'Marketplace graphql BOT',
        text: `Schema update on ${repo.main_branch} branch (<${compare.url}|\`${compare.commit}\`>)`,
        attachments: createAttachments(changes),
    })

    const url = new URL(webhook)

    const options = {
        hostname: url.hostname,
        port: url.protocol.startsWith('https') ? 443 : 80,
        path: url.pathname + url.search,
        method: 'POST',
        headers: 'Content-type: application/json',
    }

    const req = https.request(options, res => {
        console.log(`Submitting to webhook`)
        console.log(`statusCode: ${res.statusCode}`)

        res.on('data', d => {
            console.log(`Response: ${d}`)
        })
    })

    req.on('error', error => {
        console.error(error)
    })

    req.write(payload)
    req.end()

}


async function notifyChanges({ oldSchema, newSchema, repo, slackHook }) {

    const schema1 = loadSchemaSync(oldSchema, {
        loaders: [new GraphQLFileLoader()]
    })

    const schema2 = loadSchemaSync(newSchema, {
        loaders: [new GitLoader()]
    })

    let changes = await diff(schema1, schema2)

    if (!changes.length) {
        console.log('No changes detected. Ending gracefully.')
        return
    }

    await notifySlack(slackHook, repo, changes)

}


const options = {
    oldSchema: process.env.NOTIFY_SCHEMA_OLDSCHEMA,
    newSchema: process.env.NOTIFY_SCHEMA_NEWSCHEMA,
    repo: {
        url: process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY,
        main_branch: process.env.NOTIFY_SCHEMA_MAIN_BRANCH,
    },
    slackHook: process.env.WEBHOOK,
}

console.log('NOTIFY_SCHEMA_OLDSCHEMA',   process.env.NOTIFY_SCHEMA_OLDSCHEMA);
console.log('NOTIFY_SCHEMA_NEWSCHEMA',   process.env.NOTIFY_SCHEMA_NEWSCHEMA);
console.log('NOTIFY_SCHEMA_MAIN_BRANCH', process.env.NOTIFY_SCHEMA_MAIN_BRANCH);

console.log('CI', process.env.CI);
console.log('GITHUB_WORKFLOW', process.env.GITHUB_WORKFLOW);
console.log('GITHUB_RUN_ID', process.env.GITHUB_RUN_ID);
console.log('GITHUB_RUN_NUMBER', process.env.GITHUB_RUN_NUMBER);
console.log('GITHUB_JOB', process.env.GITHUB_JOB);
console.log('GITHUB_ACTION', process.env.GITHUB_ACTION);
console.log('GITHUB_ACTION_PATH', process.env.GITHUB_ACTION_PATH);
console.log('GITHUB_ACTIONS', process.env.GITHUB_ACTIONS);
console.log('GITHUB_ACTOR', process.env.GITHUB_ACTOR);
console.log('GITHUB_REPOSITORY', process.env.GITHUB_REPOSITORY);
console.log('GITHUB_EVENT_NAME', process.env.GITHUB_EVENT_NAME);
console.log('GITHUB_EVENT_PATH', process.env.GITHUB_EVENT_PATH);
console.log('GITHUB_WORKSPACE', process.env.GITHUB_WORKSPACE);
console.log('GITHUB_SHA', process.env.GITHUB_SHA);
console.log('GITHUB_REF', process.env.GITHUB_REF);
console.log('GITHUB_REF_NAME', process.env.GITHUB_REF_NAME);
console.log('GITHUB_REF_PROTECTED', process.env.GITHUB_REF_PROTECTED);
console.log('GITHUB_REF_TYPE', process.env.GITHUB_REF_TYPE);
console.log('GITHUB_HEAD_REF', process.env.GITHUB_HEAD_REF);
console.log('GITHUB_BASE_REF', process.env.GITHUB_BASE_REF);
console.log('GITHUB_SERVER_URL', process.env.GITHUB_SERVER_URL);
console.log('GITHUB_API_URL', process.env.GITHUB_API_URL);
console.log('GITHUB_GRAPHQL_URL', process.env.GITHUB_GRAPHQL_URL);
console.log('RUNNER_NAME', process.env.RUNNER_NAME);
console.log('RUNNER_OS', process.env.RUNNER_OS);
console.log('RUNNER_ARCH', process.env.RUNNER_ARCH);
console.log('RUNNER_TEMP', process.env.RUNNER_TEMP);
console.log('RUNNER_TOOL_CACHE', process.env.RUNNER_TOOL_CACHE);


notifyChanges(options)
