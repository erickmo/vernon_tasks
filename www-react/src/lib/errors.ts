import { AxiosError } from 'axios';

type ServerMessage = { message?: string; title?: string; indicator?: string };

const DOCTYPE_ROUTE: Record<string, (name: string) => string> = {
  'VT Project': (name) => `/portal/projects/${encodeURIComponent(name)}`,
  'VT Brand': (name) => `/portal/brands/${encodeURIComponent(name)}`,
};

export function routeForDoctype(doctype: string, name: string): string | null {
  const fn = DOCTYPE_ROUTE[doctype];
  return fn ? fn(name) : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseServerMessages(raw: unknown): ServerMessage[] {
  if (typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s) => (typeof s === 'string' ? (JSON.parse(s) as ServerMessage) : (s as ServerMessage)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export type LinkExists = {
  kind: 'link_exists';
  doctype: string;
  name: string;
  linkedDoctype: string;
  linkedName: string;
};

export type ParsedError =
  | { kind: 'link_exists'; link: LinkExists; text: string }
  | { kind: 'plain'; text: string };

export function parseApiError(err: unknown, fallback = 'Request failed.'): ParsedError {
  const ax = err as AxiosError<any>;
  const data = ax?.response?.data;
  if (!data) return { kind: 'plain', text: ax?.message || fallback };

  const messages = parseServerMessages(data._server_messages);
  for (const msg of messages) {
    const text = stripHtml(msg.message ?? '');
    if (!text) continue;
    const link = matchLinkExists(text);
    if (link) return { kind: 'link_exists', link, text: renderLinkExists(link) };
    return { kind: 'plain', text };
  }

  const exc = typeof data.exception === 'string' ? stripHtml(data.exception) : '';
  if (exc) {
    const link = matchLinkExists(exc);
    if (link) return { kind: 'link_exists', link, text: renderLinkExists(link) };
    return { kind: 'plain', text: exc.replace(/^[\w.]+Error:\s*/, '') };
  }

  if (typeof data.message === 'string') return { kind: 'plain', text: stripHtml(data.message) };
  return { kind: 'plain', text: fallback };
}

function matchLinkExists(text: string): LinkExists | null {
  const re =
    /Cannot delete or cancel because\s+(.+?)\s+(\S+)\s+is linked with\s+(.+?)\s+(\S+)\s*$/i;
  const m = text.match(re);
  if (!m) return null;
  return {
    kind: 'link_exists',
    doctype: (m[1] ?? '').trim(),
    name: (m[2] ?? '').trim(),
    linkedDoctype: (m[3] ?? '').trim(),
    linkedName: (m[4] ?? '').trim(),
  };
}

function renderLinkExists(link: LinkExists): string {
  return `Cannot delete: still linked to ${link.linkedDoctype} "${link.linkedName}". Reassign or delete that ${link.linkedDoctype} first.`;
}

export function formatApiError(err: unknown, fallback = 'Request failed.'): string {
  return parseApiError(err, fallback).text;
}
