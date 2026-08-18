import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchedStatusTable1782000000002 implements MigrationInterface {
  name = 'CreateWatchedStatusTable1782000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "watched_status" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "jellyfinItemId" character varying NOT NULL, "mediaId" integer NOT NULL, "watchedAt" TIMESTAMP, "progress" double precision NOT NULL DEFAULT 0, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_watchedstatus_user_jellyfin" UNIQUE ("userId", "jellyfinItemId"), CONSTRAINT "PK_watchedstatus" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_watchedstatus_userId" ON "watched_status" ("userId") `
    );
    await queryRunner.query(
      `ALTER TABLE "watched_status" ADD CONSTRAINT "FK_watchedstatus_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watched_status" DROP CONSTRAINT "FK_watchedstatus_user"`
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_watchedstatus_userId"`);
    await queryRunner.query(`DROP TABLE "watched_status"`);
  }
}
