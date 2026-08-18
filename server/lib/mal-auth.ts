import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import logger from '@server/logger';
import axios from 'axios';
import crypto from 'crypto';

const MAL_AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';
const MAL_TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';
const MAL_API_BASE = 'https://api.myanimelist.net/v2';

export class MalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalAuthError';
  }
}

export interface MalPkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface MalTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface MalUserInfo {
  id: number;
  name: string;
}

/**
 * Generate a PKCE code_verifier and code_challenge pair.
 * MAL only supports the `plain` method, so challenge === verifier.
 */
export function generatePkcePair(): MalPkcePair {
  const codeVerifier = crypto
    .randomBytes(96)
    .toString('base64url')
    .slice(0, 128);
  return { codeVerifier, codeChallenge: codeVerifier };
}

/**
 * Build the MAL OAuth2 authorization URL.
 */
export function getMalAuthUrl(
  state: string,
  codeChallenge: string,
  clientId: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'plain',
  });
  return `${MAL_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string
): Promise<MalTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  try {
    const response = await axios.post<MalTokenResponse>(MAL_TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : 'Unknown error during token exchange';
    logger.error('MAL token exchange failed', {
      label: 'MALAuth',
      error: msg,
    });
    throw new MalAuthError(`Token exchange failed: ${msg}`);
  }
}

/**
 * Refresh an expired MAL access token.
 */
export async function refreshMalToken(
  refreshToken: string,
  clientId: string
): Promise<MalTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const response = await axios.post<MalTokenResponse>(MAL_TOKEN_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : 'Unknown error during token refresh';
    logger.error('MAL token refresh failed', {
      label: 'MALAuth',
      error: msg,
    });
    throw new MalAuthError(`Token refresh failed: ${msg}`);
  }
}

/**
 * Ensure the user's MAL access token is valid, refreshing if needed.
 * Returns a valid access token or throws if refresh fails.
 */
export async function ensureValidMalToken(
  user: User,
  clientId: string
): Promise<string> {
  const now = new Date();

  if (user.malAccessToken && user.malTokenExpiresAt) {
    // Refresh if expired or expiring within 5 minutes
    if (
      new Date(user.malTokenExpiresAt).getTime() >
      now.getTime() + 5 * 60 * 1000
    ) {
      return user.malAccessToken;
    }
  }

  if (!user.malRefreshToken) {
    throw new MalAuthError(
      'No MAL refresh token available. Reconnect required.'
    );
  }

  const tokenResponse = await refreshMalToken(user.malRefreshToken, clientId);

  const userRepository = getRepository(User);
  user.malAccessToken = tokenResponse.access_token;
  user.malRefreshToken = tokenResponse.refresh_token;
  user.malTokenExpiresAt = new Date(
    Date.now() + tokenResponse.expires_in * 1000
  );
  await userRepository.save(user);

  logger.info(`Refreshed MAL token for user ${user.id}`, {
    label: 'MALAuth',
  });

  return tokenResponse.access_token;
}

/**
 * Fetch the MAL user's profile info using their access token.
 */
export async function fetchMalUserInfo(
  accessToken: string
): Promise<MalUserInfo> {
  try {
    const response = await axios.get<MalUserInfo>(`${MAL_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : 'Unknown error fetching MAL user info';
    logger.error('Failed to fetch MAL user info', {
      label: 'MALAuth',
      error: msg,
    });
    throw new MalAuthError(`Failed to fetch MAL user info: ${msg}`);
  }
}
