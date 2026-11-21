// -----------------------------------------------------------------------------
// The HTTP transport to the rabbit: a small `fetch` on top of `node:http`.
//
// Why not the global `fetch`: the web server of OpenKarotz ("OpenKarotz
// WebServer 1.0") ends its status line with CRLF but every header line with a
// bare LF. curl and browsers accept that; the strict parser of Node refuses it
// ("Missing expected CR after header value"), so every request failed and the
// rabbit looked offline. `node:http` with `insecureHTTPParser` reads it.
//
// That lenient parser is only used for the rabbits: plain HTTP to an address
// of the local network typed by the user or found by the network search, GET
// only, no redirect, a bounded answer. Nothing else in the integration uses it.
//
// The result is a standard `Response`, so the client and the network search
// work the same with the `fetch` the tests inject.
// -----------------------------------------------------------------------------

import http from 'node:http';

// A status is a few hundred bytes, a snapshot well under the 150 KB Gladys
// accepts: anything far bigger is not a rabbit answering.
const MAX_ANSWER_BYTES = 4 * 1024 * 1024;

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
    const request = http.request(url, {
      method: 'GET',
      headers,
      signal,
      insecureHTTPParser: true,
      // One connection per request: the rabbit answers HTTP/1.0 and closes.
      agent: false,
    });
    request.once('error', reject);
    request.once('response', async (response) => {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          if (size > MAX_ANSWER_BYTES) {
            throw new Error(`The answer of ${url.host} is too large`);
          }
          chunks.push(chunk);
        }
        const status = response.statusCode;
        if (status < 200 || status > 599) {
          throw new Error(`${url.host} answered an unexpected HTTP status ${status}`);
        }
        const empty = status === 204 || status === 304;
        resolve(new Response(empty ? null : Buffer.concat(chunks), { status }));
      } catch (err) {
        request.destroy();
        reject(err);
      }
    });
    request.end();
  });
}
