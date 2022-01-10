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
        url: `${repo.url}compare/${commit_from}...${commit_to}`,
        commit: commit_to,
    }

}


async function notifySlack(webhook, repo, changes) {

    const compare = await getGitCompare(repo)

    const payload = JSON.stringify({
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


async function notifyChanges({ oldSchemaGit, newSchema, repo, slackHook }) {

    const schema1 = loadSchemaSync(oldSchemaGit, {
        loaders: [new GitLoader()]
    })

    const schema2 = loadSchemaSync(newSchema, {
        loaders: [new GraphQLFileLoader()]
    })

    let changes = await diff(schema1, schema2)

    await notifySlack(slackHook, repo, changes)

}


const options = {
    oldSchemaGit: 'git:origin/master:./myschema.graphql',
    newSchema: 'myschema.graphql',
    repo: {
        url: 'https://github.com/ariunbayar/hello-graphql-inspector-action/',
        main_branch: 'origin/master',
    },
    slackHook: process.argv[2],
}

console.log(process.env.WEBHOOK.slice(0, 10))


notifyChanges(options)
