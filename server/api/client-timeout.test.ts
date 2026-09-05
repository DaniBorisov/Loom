import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import ExternalAPI, {
  DEFAULT_REQUEST_TIMEOUT_MS,
  isRequestTimeoutError,
} from '@server/api/externalapi';
import JellyfinAPI from '@server/api/jellyfin';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';

class TimeoutProbeAPI extends ExternalAPI {
  constructor(timeout?: number) {
    super(
      'http://127.0.0.1:9',
      {},
      timeout === undefined ? {} : { timeout }
    );
  }

  public async probe(): Promise<unknown> {
    return this.axios.get('/probe');
  }
}

const axiosTimeoutOf = (api: object): unknown =>
  (api as { axios: { defaults: { timeout: unknown } } }).axios.defaults
    .timeout;

describe('API client request timeouts (DAN-92)', () => {
  it('applies a safe default timeout when none is provided', () => {
    assert.equal(
      axiosTimeoutOf(new TimeoutProbeAPI()),
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  });

  it('respects an explicitly provided timeout', () => {
    assert.equal(axiosTimeoutOf(new TimeoutProbeAPI(2500)), 2500);
  });

  it('gives JellyfinAPI the configured network timeout', () => {
    // Default settings carry network.apiRequestTimeout: 10000
    assert.equal(axiosTimeoutOf(new JellyfinAPI('http://127.0.0.1:8096')), 10000);
  });

  it('gives Sonarr/Radarr clients the configured network timeout', () => {
    assert.equal(
      axiosTimeoutOf(new SonarrAPI({ url: 'http://127.0.0.1:8989', apiKey: 'x' })),
      10000
    );
    assert.equal(
      axiosTimeoutOf(new RadarrAPI({ url: 'http://127.0.0.1:7878', apiKey: 'x' })),
      10000
    );
  });

  it('classifies timeout errors distinctly from other failures', () => {
    const timeoutError = new Error('timeout of 10000ms exceeded') as Error & {
      code: string;
    };
    timeoutError.code = 'ECONNABORTED';
    assert.equal(isRequestTimeoutError(timeoutError), true);

    const messageOnly = new Error('timeout of 500ms exceeded');
    assert.equal(isRequestTimeoutError(messageOnly), true);

    const refused = new Error('connect ECONNREFUSED 127.0.0.1:9') as Error & {
      code: string;
    };
    refused.code = 'ECONNREFUSED';
    assert.equal(isRequestTimeoutError(refused), false);

    assert.equal(isRequestTimeoutError(new Error('Request failed with status code 500')), false);
    assert.equal(isRequestTimeoutError(undefined), false);
  });

  it('fails fast instead of hanging against an unreachable host', async () => {
    // 10.255.255.1 is unroutable: connects hang until axios aborts them.
    const api = new TimeoutProbeAPI(1500);
    const started = Date.now();

    await assert.rejects(() => api.probe());

    const elapsed = Date.now() - started;
    assert.ok(
      elapsed < 8000,
      `expected fail-fast, took ${elapsed}ms`
    );
  });
});
