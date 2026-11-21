// -----------------------------------------------------------------------------
// The transport to the rabbit, against the bytes a real Karotz sends.
//
// Recorded on 2026-11-21 from a Karotz on Free Rabbits OS: "OpenKarotz
// WebServer 1.0" ends its status line with CRLF and every header line with a
// bare LF. The global fetch of Node rejects that answer; rabbitFetch must read
// it. The server below listens on 127.0.0.1 only: the test stays on the machine.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { rabbitFetch } from '../src/karotz/http.js';
import { createKarotzClient } from '../src/karotz/client.js';
import { parseStatus } from '../src/rabbits.js';

const STATUS_BODY =
  '{"version":"200","ears_disabled":"0","sleep":"0","sleep_time":"0","led_color":"00FF00",' +
  '"led_pulse":"1","tts_cache_size":"1","usb_free_space":"-1","karotz_free_space":"151.0M",' +
  '"eth_mac":"00:00:00:00:00:00","wlan_mac":"00:0E:8E:2C:A1:C9","nb_tags":"0","nb_moods":"305",' +
  '"nb_sounds":"14","nb_stories":"0","karotz_percent_used_space":"35",' +
  '"usb_percent_used_space":"","data_dir":"/usr/openkarotz"}';

// The answer exactly as the rabbit writes it, bare LF included.
const karotzAnswer = (status, body) =>
  `HTTP/1.0 ${status}\r\n` +
  'Server: OpenKarotz WebServer 1.0\n' +
  'Connection: close\n' +
  'Accept-Ranges: bytes\n' +
  'Content-type: text/plain\n' +
  'Access-Control-Allow-Origin: *\n' +
  '\n' +
  body;

/** A one-shot raw TCP server on 127.0.0.1; `respond(request)` returns the bytes. */
async function serve(respond) {
  const requests = [];
  const server = net.createServer((socket) => {
    let received = '';
    socket.on('data', (chunk) => {
      received += chunk;
      if (received.includes('\r\n\r\n')) {
        requests.push(received);
        const answer = respond(received);
        if (answer !== null) {
          socket.end(answer);
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    host: `127.0.0.1:${port}`,
    requests,
    close: () => {
      server.close();
      server.unref();
    },
  };
}

test('rabbitFetch reads the bare-LF headers of OpenKarotz', async () => {
  const server = await serve(() => karotzAnswer('200 OK', STATUS_BODY));
  try {
    const response = await rabbitFetch(`http://${server.host}/cgi-bin/status`);
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.deepEqual(JSON.parse(await response.text()).wlan_mac, '00:0E:8E:2C:A1:C9');

    // The whole client on top of it: the rabbit is read and identified.
    const client = createKarotzClient(server.host);
    const status = parseStatus(await client.status());
    assert.equal(status.mac, '000e8e2ca1c9');
    assert.equal(status.version, '200');
  } finally {
    server.close();
  }
});

test('rabbitFetch passes a 401 through and sends only the headers it is given', async () => {
  const server = await serve(() => karotzAnswer('401 Unauthorized', 'login'));
  try {
    const response = await rabbitFetch(`http://${server.host}/cgi-bin/status`, {
      headers: { Authorization: 'Basic YWRtaW46eA==' },
    });
    assert.equal(response.status, 401);
    const [request] = server.requests;
    assert.match(request, /^GET \/cgi-bin\/status HTTP\/1\.1\r\n/);
    assert.match(request, /\r\nAuthorization: Basic YWRtaW46eA==\r\n/i);
    // Nothing LapinLibre would read as a cross-site request.
    assert.doesNotMatch(request, /sec-fetch-site|\r\norigin:|\r\nreferer:/i);
  } finally {
    server.close();
  }
});

test('rabbitFetch gives up on a silent rabbit and refuses anything but http', async () => {
  // Accepts the connection and never answers.
  const server = await serve(() => null);
  try {
    await assert.rejects(
      rabbitFetch(`http://${server.host}/cgi-bin/status`, {
        signal: AbortSignal.timeout(200),
      }),
    );
  } finally {
    server.close();
  }
  await assert.rejects(rabbitFetch('https://192.168.1.70/cgi-bin/status'), TypeError);
});
