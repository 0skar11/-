import { logger } from '../utils/logger.js';

// `بلاغ المشكلة` in the admin reports channel opens a GitHub issue labelled "بلاغ".
// Reports are only read and summarised for the owner; nothing is fixed until the owner asks.
export const REPORT_CHANNEL_ID = '1552304815713943602';
export const REPORT_LABEL = 'بلاغ';
const REPORT_COMMAND = 'بلاغ';
const DEFAULT_REPO = '0skar11/-';
const COOLDOWN_MS = 30_000;
const TITLE_MAX_LENGTH = 80;
const REPLY_DELETE_DELAY_MS = 5_000;

const lastReportAt = new Map();

function stripPrefix(content, prefixes) {
  const value = String(content || '').trim();
  const prefix = prefixes.filter(Boolean).sort((a, b) => b.length - a.length)
    .find((candidate) => value.startsWith(candidate));
  return prefix ? value.slice(prefix.length).trim() : value;
}

/** Returns the problem text for `بلاغ ...` (keeping line breaks), or null when it isn't a report. */
export function parseReport(content, prefixes = []) {
  const match = stripPrefix(content, prefixes).match(/^(\S+)\s*([\s\S]*)$/u);
  if (!match || match[1] !== REPORT_COMMAND) return null;
  return match[2].trim();
}

function buildIssue(message, problem) {
  const firstLine = problem.split('\n')[0];
  const title = firstLine.length > TITLE_MAX_LENGTH ? `${firstLine.slice(0, TITLE_MAX_LENGTH - 1)}…` : firstLine;
  const reporterName = message.member?.displayName || message.author.globalName || message.author.username;
  const attachments = [...(message.attachments?.values?.() || [])].map((file) => `- ${file.url}`);
  const body = [
    '### المشكلة',
    problem,
    '',
    ...(attachments.length ? ['### مرفقات', ...attachments, ''] : []),
    '### المُبلِّغ',
    `- الاسم: ${reporterName}`,
    `- اليوزر: ${message.author.username}`,
    `- ID: ${message.author.id}`,
    `- الرسالة: ${message.url}`,
    `- التاريخ: ${new Date(message.createdTimestamp || Date.now()).toISOString()}`,
  ].join('\n');
  return { title: `بلاغ: ${title}`, body, labels: [REPORT_LABEL] };
}

async function createGithubIssue(issue) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'titanbot-reports',
    },
    body: JSON.stringify(issue),
  });
  if (!response.ok) throw new Error(`GitHub responded ${response.status}: ${await response.text()}`);
  return response.json();
}

async function reply(message, content, autoDelete = false) {
  const sent = await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
  if (sent && autoDelete) setTimeout(() => sent.delete().catch(() => {}), REPLY_DELETE_DELAY_MS);
  return sent;
}

/** Handles `بلاغ المشكلة`. Returns true when the message was a report command. */
export async function handleReportMessage(message, prefixes = []) {
  const problem = parseReport(message.content, prefixes);
  if (problem === null) return false;

  if (message.channel.id !== REPORT_CHANNEL_ID) {
    await reply(message, `⚠️ البلاغات في <#${REPORT_CHANNEL_ID}> فقط`, true);
    return true;
  }
  if (!problem && !message.attachments?.size) {
    await reply(message, '⚠️ بلاغ المشكلة', true);
    return true;
  }

  const remainingMs = (lastReportAt.get(message.author.id) || 0) + COOLDOWN_MS - Date.now();
  if (remainingMs > 0) {
    await reply(message, `⏱️ Wait ${Math.ceil(remainingMs / 1000)}s`, true);
    return true;
  }
  lastReportAt.set(message.author.id, Date.now());

  try {
    const issue = await createGithubIssue(buildIssue(message, problem || '(صورة مرفقة)'));
    await reply(message, `✅ تم استلام البلاغ رقم **#${issue.number}**`);
  } catch (error) {
    lastReportAt.delete(message.author.id);
    logger.error('Failed to create report issue:', error);
    await reply(message, '❌ لم يتم إرسال البلاغ، حاول مرة أخرى لاحقاً');
  }
  return true;
}
