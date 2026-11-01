import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FALLBACK_DOMAINS, liveConfig, readDomains } from '../../src/api/domains.js';

const GITHUB = {
  hdhub4u: 'https://new11.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  greenmotors: 'https://greenmotors.cc',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
  hubcdn: 'https://hubcdn.wiki',
};
const MINUTE = 60_000;

// GitHub, answering each read with the next of `answers` (a domains object, an HTTP status, or an
// Error), and a clock the test moves.
function world(...answers) {
  const reads = [];
  let time = 0;
  const fetch = async (url) => {
    reads.push(url);
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return new Response('', { status: answer });
    return Response.json(answer);
  };
  return { fetch, reads, now: () => time, wait: (ms) => { time += ms; } };
}

const makeEngine = (domains) => ({ madeFor: domains });
const log = () => {
  const lines = [];
  return { lines, info: (m) => lines.push(['info', m]), warn: (m) => lines.push(['warn', m]) };
};
// Lets a read started in the background finish.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('liveConfig', () => {
  it('starts with the domains GitHub gives', async () => {
    const { fetch, reads, now } = world(GITHUB);

    const config = await liveConfig({ makeEngine, fetch, now });

    assert.deepEqual(config.current(log()), { domains: GITHUB, engine: { madeFor: GITHUB } });
    assert.equal(config.fallbackBecause, null);
    assert.deepEqual(reads, ['https://raw.githubusercontent.com/ElonMuskOfficial/moviehawk-domains/main/domains.json']);
  });

  it('starts with the fallback domains when GitHub fails, or gives domains it cannot use', async () => {
    for (const answer of [new TypeError('fetch failed'), 503, { hdhub4u: 'https://new10.hdhub4u.cl' }, { ...GITHUB, hubcloud: 'https://hubcloud.ist/' }]) {
      const { fetch, now } = world(answer);

      const config = await liveConfig({ makeEngine, fetch, now });

      assert.deepEqual(config.current(log()).domains, FALLBACK_DOMAINS);
      assert.ok(config.fallbackBecause);
    }
  });

  it('takes no domains without one of a gateway or host: its URLs would be read on any domain', async () => {
    for (const label of ['greenmotors', 'hblinks', 'hubdrive', 'hubcloud', 'hubcdn']) {
      const { [label]: _, ...without } = GITHUB;
      const { fetch, now } = world(without);

      const config = await liveConfig({ makeEngine, fetch, now });

      assert.deepEqual(config.current(log()).domains, FALLBACK_DOMAINS, label);
      assert.equal(config.fallbackBecause, `no domain for ${label}`);
    }
  });

  it('has fallback domains it would take from GitHub too', async () => {
    const { fetch } = world(FALLBACK_DOMAINS);

    assert.deepEqual(await readDomains({ fetch }), FALLBACK_DOMAINS);
  });

  it('reads GitHub again only when a request comes 30 minutes after the last read', async () => {
    const moved = { ...GITHUB, hdhub4u: 'https://new12.hdhub4u.cl' };
    const { fetch, reads, now, wait } = world(GITHUB, moved);
    const config = await liveConfig({ makeEngine, fetch, now });

    wait(29 * MINUTE);
    config.current(log());
    assert.equal(reads.length, 1);

    wait(1 * MINUTE);
    const requestLog = log();
    // This request does not wait: it has the domains read before; the next ones get the new.
    assert.deepEqual(config.current(requestLog).domains, GITHUB);
    config.current(log()); // while the read is under way: no second read
    await settle();

    assert.equal(reads.length, 2);
    assert.deepEqual(config.current(log()), { domains: moved, engine: { madeFor: moved } });
    assert.match(requestLog.lines[0][1], /Domains changed/);
  });

  it('keeps its domains and engine when GitHub fails or gives the same, and asks again 30 minutes later', async () => {
    const { fetch, reads, now, wait } = world(GITHUB, new TypeError('fetch failed'), GITHUB);
    const config = await liveConfig({ makeEngine, fetch, now });
    const { engine } = config.current(log());

    wait(30 * MINUTE);
    const failedLog = log();
    config.current(failedLog);
    await settle();
    config.current(log()); // straight after the failure: not asked again
    assert.equal(reads.length, 2);
    assert.equal(failedLog.lines[0][0], 'warn');

    wait(30 * MINUTE);
    config.current(log());
    await settle();
    assert.equal(reads.length, 3);
    assert.equal(config.current(log()).engine, engine);
  });
});
