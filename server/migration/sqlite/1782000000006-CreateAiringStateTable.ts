import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiringStateTable1782000000006 implements MigrationInterface {
  name = 'CreateAiringStateTable1782000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "airing_state" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "mediaType" varchar NOT NULL, "lastSeason" integer, "lastEpisode" integer, "lastAiredAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_airingstate_item" UNIQUE ("tmdbId", "mediaType"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_airingstate_tmdbId" ON "airing_state" ("tmdbId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_airingstate_tmdbId"`);
    await queryRunner.query(`DROP TABLE "airing_state"`);
  }
}
