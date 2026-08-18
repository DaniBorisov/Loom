import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchedStatusTable1782000000002 implements MigrationInterface {
  name = 'CreateWatchedStatusTable1782000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "watched_status" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "jellyfinItemId" varchar NOT NULL, "mediaId" integer NOT NULL, "watchedAt" datetime, "progress" float NOT NULL DEFAULT 0, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_watchedstatus_user_jellyfin" UNIQUE ("userId", "jellyfinItemId"))`
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
    await queryRunner.query(`DROP INDEX "IDX_watchedstatus_userId"`);
    await queryRunner.query(`DROP TABLE "watched_status"`);
  }
}
