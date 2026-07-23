// ---------------------------------------------------------------------------
// Leitor mínimo de Server-Sent Events (SSE) sobre o corpo de um fetch. Funciona
// em Node 18+ e navegadores (usa a Web Streams API de `response.body`). Só
// entende o que a rota /manager/stream envia: linhas `data: <json>` e
// comentários de keep-alive (`: ping`).
// ---------------------------------------------------------------------------

/**
 * Consome um `ReadableStream` de bytes SSE e produz cada bloco `data:` como
 * string (já concatenando linhas `data:` múltiplas do mesmo evento).
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Eventos são separados por linha em branco (\n\n). Normaliza CRLF.
      let sep: number;
      while ((sep = indexOfEventBoundary(buffer)) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){1,2}/, '');
        const data = extractData(rawEvent);
        if (data !== null) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function indexOfEventBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

/** Junta todas as linhas `data:` de um evento; ignora comentários (`: ping`). */
function extractData(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue; // comentário/keep-alive
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  return dataLines.length ? dataLines.join('\n') : null;
}
