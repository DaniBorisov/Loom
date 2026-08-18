import { WatchlistStatus } from '@server/entity/Watchlist';
import { getMalDisplayStatus, mapMalStatus } from '@server/lib/mal-mapping';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('MAL Status Mapping', () => {
  it('maps watching → WATCHING', () => {
    assert.equal(mapMalStatus('watching'), WatchlistStatus.WATCHING);
  });

  it('maps plan_to_watch → WANT_TO_WATCH', () => {
    assert.equal(mapMalStatus('plan_to_watch'), WatchlistStatus.WANT_TO_WATCH);
  });

  it('maps completed → WATCHED', () => {
    assert.equal(mapMalStatus('completed'), WatchlistStatus.WATCHED);
  });

  it('maps on_hold → WATCHING', () => {
    assert.equal(mapMalStatus('on_hold'), WatchlistStatus.WATCHING);
  });

  it('maps dropped → WATCHED', () => {
    assert.equal(mapMalStatus('dropped'), WatchlistStatus.WATCHED);
  });

  it('maps unknown status → WANT_TO_WATCH (safe default)', () => {
    assert.equal(mapMalStatus('repeating'), WatchlistStatus.WANT_TO_WATCH);
  });
});

describe('MAL Display Status', () => {
  it('returns "On Hold" for on_hold', () => {
    assert.equal(getMalDisplayStatus('on_hold'), 'On Hold');
  });

  it('returns "Dropped" for dropped', () => {
    assert.equal(getMalDisplayStatus('dropped'), 'Dropped');
  });

  it('returns null for watching (no override needed)', () => {
    assert.equal(getMalDisplayStatus('watching'), null);
  });

  it('returns null for completed (no override needed)', () => {
    assert.equal(getMalDisplayStatus('completed'), null);
  });

  it('returns null for plan_to_watch (no override needed)', () => {
    assert.equal(getMalDisplayStatus('plan_to_watch'), null);
  });

  it('returns null for null input', () => {
    assert.equal(getMalDisplayStatus(null), null);
  });
});
