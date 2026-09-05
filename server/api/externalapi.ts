import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import rateLimit from 'axios-rate-limit';
import type NodeCache from 'node-cache';

// 5 minute default TTL (in seconds)
const DEFAULT_TTL = 300;

// 10 seconds default rolling buffer (in ms)
const DEFAULT_ROLLING_BUFFER = 10000;

/**
 * Safe-by-default request timeout (in ms) for every ExternalAPI subclass.
 * axios treats `timeout: 0`/undefined as "no timeout", which lets a single
 * unreachable host hang requests (and the jobs awaiting them) indefinitely.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

export interface ExternalAPIOptions {
  nodeCache?: NodeCache;
  headers?: Record<string, unknown>;
  timeout?: number;
  rateLimit?: {
    maxRPS: number;
    maxRequests: number;
  };
}

/**
 * True when the error is an axios request timeout (ECONNABORTED / "timeout
 * of Nms exceeded"), as opposed to a refusal, DNS failure, or HTTP error.
 * Used to log timeouts distinctly so outage debugging is faster.
 */
export const isRequestTimeoutError = (e: unknown): boolean => {
  const code = (e as { code?: unknown })?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return true;
  }
  const message = (e as { message?: unknown })?.message;
  return (
    typeof message === 'string' && /timeout of \d+ms exceeded/.test(message)
  );
};

class ExternalAPI {
  protected axios: AxiosInstance;
  private baseUrl: string;
  private cache?: NodeCache;

  constructor(
    baseUrl: string,
    params: Record<string, unknown>,
    options: ExternalAPIOptions = {}
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      params,
      timeout: options.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);

    if (options.rateLimit) {
      this.axios = rateLimit(this.axios, {
        maxRequests: options.rateLimit.maxRequests,
        maxRPS: options.rateLimit.maxRPS,
      });
    }

    this.baseUrl = baseUrl;
    this.cache = options.nodeCache;
  }

  protected async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...config?.params,
      headers: config?.headers,
    });
    const cachedItem = this.cache?.get<T>(cacheKey);
    if (cachedItem) {
      return cachedItem;
    }

    const response = await this.axios.get<T>(endpoint, config);

    if (this.cache && ttl !== 0) {
      this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
    }

    return response.data;
  }

  protected async post<T>(
    endpoint: string,
    data?: Record<string, unknown>,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      config: config?.params,
      ...(data ? { data } : {}),
    });

    const cachedItem = this.cache?.get<T>(cacheKey);
    if (cachedItem) {
      return cachedItem;
    }

    const response = await this.axios.post<T>(endpoint, data, config);

    if (this.cache && ttl !== 0) {
      this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
    }

    return response.data;
  }

  protected async getRolling<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...config?.params,
      headers: config?.headers,
    });
    const cachedItem = this.cache?.get<T>(cacheKey);

    if (cachedItem) {
      const keyTtl = this.cache?.getTtl(cacheKey) ?? 0;

      // If the item has passed our rolling check, fetch again in background
      if (
        keyTtl - (ttl ?? DEFAULT_TTL) * 1000 <
        Date.now() - DEFAULT_ROLLING_BUFFER
      ) {
        this.axios.get<T>(endpoint, config).then((response) => {
          this.cache?.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
        });
      }
      return cachedItem;
    }

    const response = await this.axios.get<T>(endpoint, config);

    if (this.cache && ttl !== 0) {
      this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
    }

    return response.data;
  }

  protected removeCache(endpoint: string, options?: Record<string, unknown>) {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...options,
    });
    this.cache?.del(cacheKey);
  }

  private serializeCacheKey(
    endpoint: string,
    options?: Record<string, unknown>
  ) {
    if (!options) {
      return `${this.baseUrl}${endpoint}`;
    }

    return `${this.baseUrl}${endpoint}${JSON.stringify(options)}`;
  }
}

export default ExternalAPI;
