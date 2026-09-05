import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveVapidKeys } from '@server/lib/settings/vapid';

const generate = () => ({
  publicKey: 'generated-public',
  privateKey: 'generated-private',
});

describe('resolveVapidKeys (DAN-43)', () => {
  it('uses the env pair when both vars are set', () => {
    const resolved = resolveVapidKeys({
      storedPublic: 'stored-public',
      storedPrivate: 'stored-private',
      envPublic: 'env-public',
      envPrivate: 'env-private',
      generate,
    });

    assert.equal(resolved.publicKey, 'env-public');
    assert.equal(resolved.privateKey, 'env-private');
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.changed, false);
  });

  it('uses the stored pair when no env is set', () => {
    const resolved = resolveVapidKeys({
      storedPublic: 'stored-public',
      storedPrivate: 'stored-private',
      generate,
    });

    assert.equal(resolved.publicKey, 'stored-public');
    assert.equal(resolved.privateKey, 'stored-private');
    assert.equal(resolved.source, 'stored');
    assert.equal(resolved.changed, false);
  });

  it('generates and flags persist when nothing is stored', () => {
    const resolved = resolveVapidKeys({
      storedPublic: '',
      storedPrivate: '',
      generate,
    });

    assert.equal(resolved.publicKey, 'generated-public');
    assert.equal(resolved.privateKey, 'generated-private');
    assert.equal(resolved.source, 'generated');
    assert.equal(resolved.changed, true);
  });

  it('regenerates the whole pair when only half is stored', () => {
    const resolved = resolveVapidKeys({
      storedPublic: 'stored-public',
      storedPrivate: '',
      generate,
    });

    assert.equal(resolved.publicKey, 'generated-public');
    assert.equal(resolved.privateKey, 'generated-private');
    assert.equal(resolved.source, 'generated');
    assert.equal(resolved.changed, true);
  });

  it('ignores a half-set env pair and falls back to stored', () => {
    const resolved = resolveVapidKeys({
      storedPublic: 'stored-public',
      storedPrivate: 'stored-private',
      envPublic: 'env-public',
      generate,
    });

    assert.equal(resolved.publicKey, 'stored-public');
    assert.equal(resolved.privateKey, 'stored-private');
    assert.equal(resolved.source, 'stored');
  });
});
