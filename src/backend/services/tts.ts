const KOKORO_TTS_URL = process.env.KOKORO_TTS_URL?.trim() || '';
const KOKORO_TTS_API_KEY = process.env.KOKORO_TTS_API_KEY?.trim() || 'not-needed';
const KOKORO_TTS_MODEL = 'kokoro';
const KOKORO_TTS_VOICE = 'af_sky+af_bella';

function ensureSentencePause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  return /[.!?:;…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeWhitespace(text: string): string {
  const normalizedLines = text
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '));

  const collapsedLines: string[] = [];
  let previousWasBlank = false;

  for (const line of normalizedLines) {
    if (!line) {
      if (!previousWasBlank) {
        collapsedLines.push('');
      }
      previousWasBlank = true;
      continue;
    }

    collapsedLines.push(line);
    previousWasBlank = false;
  }

  return collapsedLines.join('\n').trim();
}

export function isKokoroTtsEnabled(): boolean {
  return KOKORO_TTS_URL.length > 0;
}

export function preprocessMarkdownForTts(markdown: string): string {
  let text = markdown.replace(/\r\n/g, '\n');

  text = text.replace(/^---\n[\s\S]*?\n---\n*/m, '');
  text = text.replace(/```[\s\S]*?```/g, '\n');
  text = text.replace(/`([^`]+)`/g, '$1');

  text = text.replace(/^#{1,6}\s+(.*)$/gm, (_, heading: string) => ensureSentencePause(heading));
  text = text.replace(/^\s*>\s?(.*)$/gm, '$1');
  text = text.replace(/^\s*[-*+]\s+(.*)$/gm, (_, item: string) => ensureSentencePause(item));
  text = text.replace(/^\s*\d+\.\s+(.*)$/gm, (_, item: string) => ensureSentencePause(item));

  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  text = text.replace(/_(.*?)_/g, '$1');
  text = text.replace(/~~(.*?)~~/g, '$1');

  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '\n');
  text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_, row: string) => row.replace(/\|/g, ' '));
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');

  return normalizeWhitespace(text);
}

export async function synthesizeSpeechFromMarkdown(markdown: string): Promise<Response> {
  if (!isKokoroTtsEnabled()) {
    throw new Error('Kokoro TTS is not configured');
  }

  const input = preprocessMarkdownForTts(markdown);
  if (!input) {
    throw new Error('Article has no readable text for TTS');
  }

  const response = await fetch(`${KOKORO_TTS_URL.replace(/\/+$/, '')}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KOKORO_TTS_API_KEY}`
    },
    body: JSON.stringify({
      model: KOKORO_TTS_MODEL,
      voice: KOKORO_TTS_VOICE,
      input
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to generate speech (status ${response.status})`);
  }

  return response;
}
