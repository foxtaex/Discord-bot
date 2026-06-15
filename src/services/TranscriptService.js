import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class TranscriptService {
  constructor({ logger, baseDirectory = './data/transcripts' }) {
    this.logger = logger;
    this.baseDirectory = path.resolve(process.cwd(), baseDirectory);
  }

  async create(channel, ticket, maxMessages = 5000) {
    const messages = await fetchMessages(channel, maxMessages);
    const html = renderTranscript(channel, ticket, messages);
    const directory = path.join(this.baseDirectory, ticket.guildId);
    const filePath = path.join(
      directory,
      `ticket-${ticket.ticketNumber}.html`,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, html, 'utf8');
    this.logger.info(
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        filePath,
        messageCount: messages.length,
      },
      'Ticket transcript created',
    );
    return filePath;
  }
}

async function fetchMessages(channel, maxMessages) {
  const messages = [];
  let before;

  while (messages.length < maxMessages) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, maxMessages - messages.length),
      before,
    });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function renderTranscript(channel, ticket, messages) {
  const items = messages
    .map((message) => {
      const attachments = [...message.attachments.values()]
        .map(
          (attachment) =>
            `<a href="${escapeAttribute(attachment.url)}">${escapeHtml(
              attachment.name || 'Anhang',
            )}</a>`,
        )
        .join(' ');
      const content =
        escapeHtml(message.cleanContent || message.content || '').replaceAll(
          '\n',
          '<br>',
        ) || '<em>Kein Textinhalt</em>';

      return `<article class="message">
        <img src="${escapeAttribute(message.author.displayAvatarURL())}" alt="">
        <div>
          <header><strong>${escapeHtml(message.author.tag)}</strong><time>${escapeHtml(
            message.createdAt.toISOString(),
          )}</time></header>
          <p>${content}</p>
          ${attachments ? `<div class="attachments">${attachments}</div>` : ''}
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ticket ${ticket.ticketNumber}</title>
  <style>
    body{margin:0;background:#1e1f22;color:#dbdee1;font:15px system-ui,sans-serif}
    main{max-width:1000px;margin:auto;padding:32px}
    h1{color:#fff}.meta{color:#949ba4;margin-bottom:28px}
    .message{display:grid;grid-template-columns:48px 1fr;gap:14px;padding:10px 8px}
    .message:hover{background:#2b2d31}.message img{width:44px;height:44px;border-radius:50%}
    header{display:flex;gap:12px;align-items:baseline}time{color:#949ba4;font-size:12px}
    p{margin:5px 0;line-height:1.45}.attachments a{color:#00a8fc;margin-right:10px}
  </style>
</head>
<body><main>
  <h1>Ticket ${ticket.ticketNumber}: ${escapeHtml(ticket.categoryKey)}</h1>
  <div class="meta">Kanal: ${escapeHtml(channel.name)} · Nutzer: ${escapeHtml(
    ticket.userId,
  )} · Export: ${new Date().toISOString()}</div>
  ${items || '<p>Keine Nachrichten vorhanden.</p>'}
</main></body></html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
