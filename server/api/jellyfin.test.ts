import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import cacheManager from '@server/lib/cache';
import { ApiError } from '@server/types/error';

function buildJellyfin(): JellyfinAPI {
  return new JellyfinAPI('http://localhost:8096', 'test-token');
}

function getAxios(jf: JellyfinAPI) {
  return (jf as unknown as { axios: { get: typeof import('axios').default.get } })
    .axios;
}

describe('JellyfinAPI lookupByProviderId', () => {
  afterEach(() => {
    mock.restoreAll();
    cacheManager.getCache('jellyfin').flush();
  });

  it('returns the item when found by TMDB ID', async () => {
    const jf = buildJellyfin();
    const mockItem = {
      Id: 'abc123',
      Name: 'Test Movie',
      ProviderIds: { Tmdb: '12345' },
    };
    mock.method(getAxios(jf), 'get', async () => ({
      data: { Items: [mockItem], TotalRecordCount: 1, StartIndex: 0 },
    }));

    const result = await jf.lookupByProviderId('12345', 'Tmdb');

    assert.deepStrictEqual(result, mockItem);
  });

  it('returns null when not found', async () => {
    const jf = buildJellyfin();
    mock.method(getAxios(jf), 'get', async () => ({
      data: { Items: [], TotalRecordCount: 0, StartIndex: 0 },
    }));

    const result = await jf.lookupByProviderId('99999', 'Tmdb');

    assert.strictEqual(result, null);
  });

  it('throws on Jellyfin API error', async () => {
    const jf = buildJellyfin();
    mock.method(getAxios(jf), 'get', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(
      () => jf.lookupByProviderId('12345', 'Tmdb'),
      (err: ApiError) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.statusCode, 500);
        return true;
      }
    );
  });

  it('throws ApiError with ConnectionError when no response', async () => {
    const jf = buildJellyfin();
    mock.method(getAxios(jf), 'get', async () => {
      throw new Error('ECONNREFUSED');
    });

    await assert.rejects(() => jf.lookupByProviderId('12345', 'Tmdb'));
  });

  it('supports Tvdb provider type', async () => {
    const jf = buildJellyfin();
    const mockItem = {
      Id: 'def456',
      Name: 'Test Show',
      ProviderIds: { Tvdb: '67890' },
    };
    mock.method(getAxios(jf), 'get', async () => ({
      data: { Items: [mockItem], TotalRecordCount: 1, StartIndex: 0 },
    }));

    const result = await jf.lookupByProviderId('67890', 'Tvdb', 'Series');

    assert.deepStrictEqual(result, mockItem);
  });

  it('supports TheMovieDb provider type as fallback', async () => {
    const jf = buildJellyfin();
    const mockItem = {
      Id: 'ghi789',
      Name: 'Test Movie 2',
      ProviderIds: { TheMovieDb: '11111' },
    };
    mock.method(getAxios(jf), 'get', async () => ({
      data: { Items: [mockItem], TotalRecordCount: 1, StartIndex: 0 },
    }));

    const result = await jf.lookupByProviderId('11111', 'TheMovieDb');

    assert.deepStrictEqual(result, mockItem);
  });
});
