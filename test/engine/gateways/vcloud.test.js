import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { answer } from '../helpers.js';
import { expandVCloud } from '../../../engine/gateways/vcloud.js';

// A live V-Cloud link page (2026-11-03), behind a 2022 NexDrive page.
const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

describe('expandVCloud', () => {
  it('gives its one button: the file\'s V-Cloud page, on its older domain', async () => {
    const page = await expandVCloud('https://vcloud.beer/api/index.php?link=x', answer(fixture('vcloud-api.html')));

    assert.deepEqual(page, { links: [{ url: 'https://vcloud.zip/gheyw_bhhk1y1zj', label: 'Direct Download [Resume]' }] });
  });

  it('leads nowhere from a card without a button, and is unrecognized for a page without its card', async () => {
    assert.deepEqual(await expandVCloud('https://vcloud.beer/api/index.php?link=x', answer('<div class="card-body"><h4></h4></div>')), { links: [] });
    await assert.rejects(expandVCloud('https://vcloud.beer/api/index.php?link=x', answer('<title>Just a moment...</title>')), { code: 'unrecognized' });
  });
});
