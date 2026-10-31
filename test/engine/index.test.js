import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as engine from '../../src/engine/index.js';

describe('the engine\'s entry', () => {
  it('gives a consumer the five functions and EngineError, and nothing else', () => {
    assert.deepEqual(Object.keys(engine).sort(), ['EngineError', 'resolve', 'scrapeFile', 'scrapeLinks', 'scrapeListing', 'scrapePost']);
  });
});
