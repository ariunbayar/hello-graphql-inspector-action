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


async function notifySlack(webhook, pull_request, changes) {

    const payload = JSON.stringify({
        username: 'Marketplace graphql BOT',
        text: `Schema update on <${pull_request.url}|\`${pull_request.title}\`>`,
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


function loadSchema(schema) {
    return loadSchemaSync(schema, {
        loaders: [new GitLoader()]
    })
}


async function notifyChanges({ oldSchema, newSchema, pull_request, slackHook }) {

    const schema1 = loadSchema(oldSchema)
    const schema2 = loadSchema(newSchema)

    let changes = await diff(schema1, schema2)

    if (!changes.length) {
        console.log('No changes detected. Ending gracefully.')
        return
    }

    await notifySlack(slackHook, pull_request, changes)

}


const options = {
    oldSchema: process.env.GRAPHQL_SCHEMA_OLD,
    newSchema: process.env.GRAPHQL_SCHEMA_NEW,
    pull_request: {
        url: process.env.PULL_REQUEST_URL,
        title: process.env.PULL_REQUEST_TITLE,
    }
    slackHook: process.env.WEBHOOK_SLACK_GRAPHQL,
}

notifyChanges(options)
