// -----------------------------------------------------------------------------
// The HTTP transport to the rabbit: a minimal HTTP/1.0 client on a raw socket.
//
// Why not `fetch`, nor `node:http`: the web server of OpenKarotz ("OpenKarotz
// WebServer 1.0") lets its CGI scripts write the headers, and they break HTTP
// in two ways, both seen on a real Karotz (Free Rabbits OS, 2026-11-21):
//   - every header line ends with a bare LF: Node's strict parser refuses it;
//   - some scripts (snapshot with its shutter sound, any snapshot while the
//     rabbit sleeps) print the output of `dbus-send` BETWEEN the status line
//     and their headers ("method return sender=...", "   boolean true"). No
//     HTTP parser accepts that, not even Node's lenient one, so the picture
//     was taken but the integration saw "no answer".
// Here the request is HTTP/1.0 (the server closes the connection, no chunked
// body), the status comes from the status line, the headers end at the first
// empty line, and whatever sits between is ignored: the integration reads none
// of the rabbit's headers.
//
// Only for the rabbits: plain HTTP to a host typed by the user or found by the
// network search, GET only, no redirect, a bounded answer. The result is a
// standard `Response`, so the client and the network search work the same with
// the `fetch` the tests inject.
// -----------------------------------------------------------------------------

import net from 'node:net';

// A status is a few hundred bytes, a snapshot well under the 150 KB Gladys
// accepts: anything far bigger is not a rabbit answering.
const MAX_ANSWER_BYTES = 4 * 1024 * 1024;

const STATUS_LINE = /^HTTP\/1\.[01] (\d{3})[^\n]*\n/;

/**
 * Split a raw HTTP answer into its status and its body.
 * @param {Buffer} raw everything the server sent before closing
 * @returns {{ status: number, body: Buffer }}
 */
export function parseRawAnswer(raw) {
  // Only the head is text; the body may be a JPEG.
  const head = raw.subarray(0, Math.min(raw.length, 8192)).toString('latin1');
  const statusLine = head.match(STATUS_LINE);
  if (!statusLine) {
    throw new Error('Not an HTTP answer');
  }
  const status = Number(statusLine[1]);
  // The headers end at the first empty line, CRLF or bare LF.
  const end = /\r?\n\r?\n/.exec(head.slice(statusLine[0].length - 1));
  if (!end) {
    throw new Error('Incomplete HTTP answer');
  }
  const bodyStart = statusLine[0].length - 1 + end.index + end[0].length;
  return { status, body: raw.subarray(bodyStart) };
}

/**
 * GET `input` and resolve a `Response`, or reject like `fetch` does (a
 * network error, an abort through `signal`).
 * @param {string|URL} input an `http://` URL
 * @param {{ signal?: AbortSignal, headers?: Record<string, string> }} [init]
 * @returns {Promise<Response>}
 */
export function rabbitFetch(input, { signal, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(String(input));
    if (url.protocol !== 'http:') {
      reject(new TypeError(`Only http:// is supported, not ${url.protocol}`));
      return;
    }
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const lines = [`GET ${url.pathname}${url.search} HTTP/1.0`, `Host: ${url.host}`];
    for (const [name, value] of Object.entries(headers)) {
      // A header is one line: never let a value carry another one.
      if (/[\r\n]/.test(`${name}${value}`)) {
        reject(new TypeError(`Invalid header ${name}`));
        return;
      }
      lines.push(`${name}: ${value}`);
    }

    const socket = net.connect({ host: url.hostname, port: Number(url.port) || 80 });
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (err, response) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    };
    const onAbort = () => finish(signal.reason ?? new Error('Aborted'));
    signal?.addEventListener('abort', onAbort, { once: true });

    // write, not end: a half-closed socket can look like a client gone.
    socket.once('connect', () => socket.write(`${lines.join('\r\n')}\r\n\r\n`));
    socket.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_ANSWER_BYTES) {
        finish(new Error(`The answer of ${url.host} is too large`));
        return;
      }
      chunks.push(chunk);
    });
    socket.once('error', (err) => finish(err));
    socket.once('close', () => {
      try {
        const { status, body } = parseRawAnswer(Buffer.concat(chunks));
        if (status < 200 || status > 599) {
          throw new Error(`${url.host} answered an unexpected HTTP status ${status}`);
        }
        const empty = status === 204 || status === 304;
        finish(null, new Response(empty ? null : body, { status }));
      } catch (err) {
        finish(err);
      }
    });
  });
}
