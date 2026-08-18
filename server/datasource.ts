import fs from 'fs';
import type { TlsOptions } from 'tls';
import type { DataSourceOptions, EntityTarget, Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { Blocklist } from './entity/Blocklist';
import DiscoverSlider from './entity/DiscoverSlider';
import { Favorite } from './entity/Favorite';
import Issue from './entity/Issue';
import IssueComment from './entity/IssueComment';
import Media from './entity/Media';
import { MediaRequest } from './entity/MediaRequest';
import OverrideRule from './entity/OverrideRule';
import Season from './entity/Season';
import SeasonRequest from './entity/SeasonRequest';
import { Session } from './entity/Session';
import { User } from './entity/User';
import { UserPushSubscription } from './entity/UserPushSubscription';
import { UserSettings } from './entity/UserSettings';
import { WatchedStatus } from './entity/WatchedStatus';
import { Watchlist } from './entity/Watchlist';

const DB_SSL_PREFIX = 'DB_SSL_';

function boolFromEnv(envVar: string, defaultVal = false) {
  if (process.env[envVar]) {
    return process.env[envVar]?.toLowerCase() === 'true';
  }
  return defaultVal;
}

function intFromEnv(envVar: string, defaultVal?: number): number | undefined {
  const val = process.env[envVar];
  if (val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultVal : parsed;
  }
  return defaultVal;
}

function stringOrReadFileFromEnv(envVar: string): Buffer | string | undefined {
  if (process.env[envVar]) {
    return process.env[envVar];
  }
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    return fs.readFileSync(filePath);
  }
  return undefined;
}

function buildSslConfig(): TlsOptions | undefined {
  if (process.env.DB_USE_SSL?.toLowerCase() !== 'true') {
    return undefined;
  }
  return {
    rejectUnauthorized: boolFromEnv(
      `${DB_SSL_PREFIX}REJECT_UNAUTHORIZED`,
      true
    ),
    ca: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}CA`),
    key: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}KEY`),
    cert: stringOrReadFileFromEnv(`${DB_SSL_PREFIX}CERT`),
  };
}

const testEntities = [
  Blocklist,
  DiscoverSlider,
  Favorite,
  Issue,
  IssueComment,
  Media,
  MediaRequest,
  OverrideRule,
  Season,
  SeasonRequest,
  Session,
  User,
  UserPushSubscription,
  UserSettings,
  WatchedStatus,
  Watchlist,
];

const testConfig: DataSourceOptions = {
  type: 'sqlite',
  database: ':memory:',
  synchronize: false,
  dropSchema: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: testEntities,
  migrations: ['server/migration/sqlite/**/*.ts'],
  subscribers: ['server/subscriber/**/*.ts'],
};

const devConfig: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.CONFIG_DIRECTORY
    ? `${process.env.CONFIG_DIRECTORY}/db/db.sqlite3`
    : 'config/db/db.sqlite3',
  synchronize: true,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities: ['server/entity/**/!(*.test).ts'],
  migrations: ['server/migration/sqlite/**/*.ts'],
  subscribers: ['server/subscriber/**/*.ts'],
};

const prodConfig: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.CONFIG_DIRECTORY
    ? `${process.env.CONFIG_DIRECTORY}/db/db.sqlite3`
    : 'config/db/db.sqlite3',
  synchronize: false,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  enableWAL: true,
  entities: ['dist/entity/**/*.js'],
  migrations: ['dist/migration/sqlite/**/*.js'],
  subscribers: ['dist/subscriber/**/*.js'],
};

const postgresDevConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_SOCKET_PATH || process.env.DB_HOST,
  port: process.env.DB_SOCKET_PATH
    ? undefined
    : parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? 'seerr',
  ssl: buildSslConfig(),
  poolSize: intFromEnv('DB_POOL_SIZE'),
  synchronize: false,
  migrationsRun: true,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: ['server/entity/**/*.ts'],
  migrations: ['server/migration/postgres/**/*.ts'],
  subscribers: ['server/subscriber/**/*.ts'],
};

const postgresProdConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_SOCKET_PATH || process.env.DB_HOST,
  port: process.env.DB_SOCKET_PATH
    ? undefined
    : parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? 'seerr',
  ssl: buildSslConfig(),
  poolSize: intFromEnv('DB_POOL_SIZE'),
  synchronize: false,
  migrationsRun: false,
  logging: boolFromEnv('DB_LOG_QUERIES'),
  entities: ['dist/entity/**/*.js'],
  migrations: ['dist/migration/postgres/**/*.js'],
  subscribers: ['dist/subscriber/**/*.js'],
};

export const isPgsql = process.env.DB_TYPE === 'postgres';

function getDataSource(): DataSourceOptions {
  if (process.env.NODE_ENV === 'test') {
    return testConfig;
  } else if (process.env.NODE_ENV === 'production') {
    return isPgsql ? postgresProdConfig : prodConfig;
  } else {
    return isPgsql ? postgresDevConfig : devConfig;
  }
}

const dataSource = new DataSource(getDataSource());

export const getRepository = <Entity extends object>(
  target: EntityTarget<Entity>
): Repository<Entity> => {
  return dataSource.getRepository(target);
};

export default dataSource;
