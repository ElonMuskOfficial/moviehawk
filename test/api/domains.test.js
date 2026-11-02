import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FALLBACK_DOMAINS, readDomains, startDomains } from '../../src/domains.js';

const GITHUB = {
  hdhub4u: 'https://new11.hdhub4u.cl',
  '4khdhub': 'https://4khdhub.one',
  greenmotors: 'https://greenmotors.cc',
  hblinks: 'https://hblinks.lol',
  hubdrive: 'https://hubdrive.bar',
  hubcloud: 'https://hubcloud.ist',
  hubcdn: 'https://hubcdn.wiki',
};
// GitHub, answering with `answer`: a domains object, an HTTP status, or an Error.
function github(answer) {
  const reads = [];
  const fetch = async (url) => {
    reads.push(url);
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return new Response('', { status: answer });
    return Response.json(answer);
  };
  return { fetch, reads };
}

describe('startDomains', () => {
  it('starts with the domains GitHub gives', async () => {
    const { fetch, reads } = github(GITHUB);

    assert.deepEqual(await startDomains({ fetch }), { domains: GITHUB, fallbackBecause: null });
    assert.deepEqual(reads, ['https://raw.githubusercontent.com/ElonMuskOfficial/moviehawk-domains/main/domains.json']);
  });

  it('starts with the fallback domains when GitHub fails, or gives domains it cannot use', async () => {
    for (const answer of [new TypeError('fetch failed'), 503, { hdhub4u: 'https://new10.hdhub4u.cl' }, { ...GITHUB, hubcloud: 'https://hubcloud.ist/' }]) {
      const { domains, fallbackBecause } = await startDomains(github(answer));

      assert.deepEqual(domains, FALLBACK_DOMAINS);
      assert.ok(fallbackBecause);
    }
  });

  it('takes no domains without one of a gateway or host: its URLs would be read on any domain', async () => {
    for (const label of ['greenmotors', 'hblinks', 'hubdrive', 'hubcloud', 'hubcdn']) {
      const { [label]: _, ...without } = GITHUB;

      const { domains, fallbackBecause } = await startDomains(github(without));

      assert.deepEqual(domains, FALLBACK_DOMAINS, label);
      assert.equal(fallbackBecause, `no domain for ${label}`);
    }
  });

  it('has fallback domains it would take from GitHub too', async () => {
    assert.deepEqual(await readDomains(github(FALLBACK_DOMAINS)), FALLBACK_DOMAINS);
  });
});
