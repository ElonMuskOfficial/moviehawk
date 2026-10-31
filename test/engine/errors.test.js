import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError } from '../../src/engine/errors.js';

describe('EngineError', () => {
  it('carries the code and what failed', () => {
    const error = new EngineError('notFound', 'HTTP 404', { url: 'https://hubcloud.ist/drive/abc', status: 404 });

    assert.ok(error instanceof Error);
    assert.equal(error.name, 'EngineError');
    assert.equal(error.code, 'notFound');
    assert.equal(error.message, 'HTTP 404');
    assert.equal(error.url, 'https://hubcloud.ist/drive/abc');
    assert.equal(error.status, 404);
  });

  it('leaves what is not known as null, and has no cause unless given', () => {
    const error = new EngineError('unsupported', 'No host handles this URL');

    assert.equal(error.url, null);
    assert.equal(error.status, null);
    assert.equal('cause' in error, false);
  });

  it('keeps the error underneath as its cause', () => {
    const timeout = new DOMException('The operation timed out', 'TimeoutError');
    const error = new EngineError('transient', 'No answer within 8 s', { cause: timeout });

    assert.equal(error.cause, timeout);
  });

  it('refuses a code that is not one of the four', () => {
    assert.throws(() => new EngineError('notfound', 'typo'), TypeError);
  });
});
