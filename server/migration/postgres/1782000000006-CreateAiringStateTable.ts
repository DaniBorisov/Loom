import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiringStateTable1782000000006 implements MigrationInterface {
  name = 'CreateAiringStateTable1782000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "airing_state" ("id" SERIAL NOT NULL, "tmdbId" integer NOT NULL, "mediaType" character varying NOT NULL, "lastSeason" integer, "lastEpisode" integer, "lastAiredAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_airingstate_item" UNIQUE ("tmdbId", "mediaType"), CONSTRAINT "PK_airingstate" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_airingstate_tmdbId" ON "airing_state" ("tmdbId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_airingstate_tmdbId"`);
    await queryRunner.query(`DROP TABLE "airing_state"`);
  }
}
