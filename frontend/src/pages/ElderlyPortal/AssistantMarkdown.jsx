import React from 'react';

// A deliberately small Markdown subset. React escapes every string; HTML,
// links, images and code are never executed or fetched from model output.
const inline = text => text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
  ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part);
export default function AssistantMarkdown({ text }) {
  const blocks = []; let list = [], ordered = false, code = null;
  const flush = () => { if (list.length) { const Tag = ordered ? 'ol' : 'ul'; blocks.push(<Tag key={blocks.length}>{list.map((line, index) => <li key={index}>{inline(line)}</li>)}</Tag>); list = []; } };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('```')) {
      flush(); if (code === null) code = []; else { blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>); code = null; }
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (bullet) { const numbered = /^\d/.test(bullet[1]); if (numbered !== ordered) flush(); ordered = numbered; list.push(bullet[2]); continue; }
    flush(); if (!line.trim()) continue;
    blocks.push(/^#{1,6}\s/.test(line) ? <p className="assistant-markdown-heading" key={blocks.length}>{inline(line.replace(/^#{1,6}\s+/, ''))}</p>
      : <p key={blocks.length}>{inline(line)}</p>);
  }
  flush(); if (code !== null) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
  return <div className="assistant-markdown">{blocks}</div>;
}
