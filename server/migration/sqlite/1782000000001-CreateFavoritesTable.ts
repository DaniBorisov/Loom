import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFavoritesTable1782000000001 implements MigrationInterface {
  name = 'CreateFavoritesTable1782000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NOTE: SQLite has no ALTER TABLE ... ADD CONSTRAINT — the foreign key
    // is declared inline (valid SQLite) instead of added afterwards.
    await queryRunner.query(
      `CREATE TABLE "favorite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "mediaId" integer NOT NULL, "mediaType" varchar NOT NULL, "source" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_favorite_user_media_source" UNIQUE ("userId", "mediaId", "source"), CONSTRAINT "FK_favorite_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_favorite_userId" ON "favorite" ("userId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_favorite_userId"`);
    await queryRunner.query(`DROP TABLE "favorite"`);
  }
}
