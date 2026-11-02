import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../engine/errors.js';

describe('EngineError', () => {
  it('carries the code and what failed', () => {
    const error = new EngineError('notFound', 'hubcloud.ist answered HTTP 404', { url: 'https://hubcloud.ist/drive/abc' });

    assert.ok(error instanceof Error);
    assert.equal(error.name, 'EngineError');
    assert.equal(error.code, 'notFound');
    assert.equal(error.message, 'hubcloud.ist answered HTTP 404');
    assert.equal(error.url, 'https://hubcloud.ist/drive/abc');
  });

  it('leaves what is not known as null, and has no cause unless given', () => {
    const error = new EngineError('unsupported', 'No host handles this URL');

    assert.equal(error.url, null);
    assert.equal('cause' in error, false);
  });

  it('keeps the error underneath as its cause', () => {
    const timeout = new DOMException('The operation timed out', 'TimeoutError');
    const error = new EngineError('transient', 'hubcloud.ist did not answer within 8000 ms', { cause: timeout });

    assert.equal(error.cause, timeout);
  });

  it('refuses a code that is not one of the four', () => {
    assert.throws(() => new EngineError('notfound', 'typo'), TypeError);
  });
});
