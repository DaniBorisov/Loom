import { generatePkcePair, getMalAuthUrl } from '@server/lib/mal-auth';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('MAL Auth', () => {
  describe('generatePkcePair', () => {
    it('generates a valid PKCE pair where challenge equals verifier', () => {
      const pair = generatePkcePair();
      assert.equal(pair.codeVerifier, pair.codeChallenge);
    });

    it('generates a verifier between 43 and 128 characters', () => {
      const pair = generatePkcePair();
      assert.ok(pair.codeVerifier.length >= 43);
      assert.ok(pair.codeVerifier.length <= 128);
    });

    it('generates unique pairs on each call', () => {
      const pair1 = generatePkcePair();
      const pair2 = generatePkcePair();
      assert.notEqual(pair1.codeVerifier, pair2.codeVerifier);
    });
  });

  describe('getMalAuthUrl', () => {
    it('builds correct authorization URL', () => {
      const url = getMalAuthUrl(
        'test_state',
        'test_challenge',
        'test_client_id',
        'http://localhost:5055/callback'
      );

      assert.ok(url.startsWith('https://myanimelist.net/v1/oauth2/authorize?'));
      assert.ok(url.includes('response_type=code'));
      assert.ok(url.includes('client_id=test_client_id'));
      assert.ok(url.includes('state=test_state'));
      assert.ok(url.includes('code_challenge=test_challenge'));
      assert.ok(url.includes('code_challenge_method=plain'));
      assert.ok(url.includes('redirect_uri='));
    });
  });
});
