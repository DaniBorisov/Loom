import { MalApiError, MyAnimeList } from '@server/api/mal';
import type { User } from '@server/entity/User';
import axios from 'axios';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const mockUser = {
  id: 1,
  malAccessToken: 'test_access_token',
  malRefreshToken: 'test_refresh_token',
  malTokenExpiresAt: new Date(Date.now() + 86400000),
} as unknown as User;

function buildMal(): MyAnimeList {
  process.env.MAL_CLIENT_ID = 'test_client_id';
  return new MyAnimeList();
}

describe('MyAnimeList API Client', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches a single page of anime list', async () => {
    const mal = buildMal();
    const mockGet = mock.method(axios, 'get', async () => ({
      data: {
        data: [
          {
            node: { id: 1, title: 'Test Anime' },
            list_status: {
              status: 'watching',
              score: 8,
              num_episodes_watched: 5,
              is_rewatching: false,
            },
          },
        ],
        paging: {},
      },
    }));

    const entries = await mal.getAnimeList(mockUser);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].node.title, 'Test Anime');
    assert.equal(mockGet.mock.callCount(), 1);
  });

  it('handles empty list', async () => {
    const mal = buildMal();
    mock.method(axios, 'get', async () => ({
      data: { data: [], paging: {} },
    }));

    const entries = await mal.getAnimeList(mockUser);
    assert.equal(entries.length, 0);
  });

  it('paginates through multiple pages', async () => {
    const mal = buildMal();
    let callCount = 0;

    mock.method(axios, 'get', async () => {
      callCount++;
      if (callCount === 1) {
        return {
          data: {
            data: [
              {
                node: { id: 1, title: 'Anime 1' },
                list_status: {
                  status: 'watching',
                  score: 0,
                  num_episodes_watched: 0,
                  is_rewatching: false,
                },
              },
            ],
            paging: { next: 'page2' },
          },
        };
      }
      return {
        data: {
          data: [
            {
              node: { id: 2, title: 'Anime 2' },
              list_status: {
                status: 'completed',
                score: 9,
                num_episodes_watched: 24,
                is_rewatching: false,
              },
            },
          ],
          paging: {},
        },
      };
    });

    const entries = await mal.getAnimeList(mockUser);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].node.title, 'Anime 1');
    assert.equal(entries[1].node.title, 'Anime 2');
    assert.equal(callCount, 2);
  });

  it('throws MalApiError on 401 response', async () => {
    const mal = buildMal();
    mock.method(axios, 'get', async () => {
      const error = new Error('Unauthorized');
      (error as unknown as { response: { status: number } }).response = {
        status: 401,
      };
      throw error;
    });

    mock.method(axios, 'isAxiosError', () => true);

    await assert.rejects(
      () => mal.getAnimeList(mockUser),
      (err: unknown) => {
        assert.ok(err instanceof MalApiError);
        assert.ok(
          (err as MalApiError).message.includes(
            'MAL access token expired or revoked'
          )
        );
        return true;
      }
    );
  });

  it('throws MalApiError when client ID is not configured', async () => {
    delete process.env.MAL_CLIENT_ID;
    const mal = new MyAnimeList();

    await assert.rejects(
      () => mal.getAnimeList(mockUser),
      (err: unknown) => {
        assert.ok(err instanceof MalApiError);
        assert.ok(
          (err as MalApiError).message.includes('client ID not configured')
        );
        return true;
      }
    );
  });
});
