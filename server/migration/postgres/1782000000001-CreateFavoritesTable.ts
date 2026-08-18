import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFavoritesTable1782000000001 implements MigrationInterface {
  name = 'CreateFavoritesTable1782000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favorite" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "mediaId" integer NOT NULL, "mediaType" character varying NOT NULL, "source" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_favorite_user_media_source" UNIQUE ("userId", "mediaId", "source"), CONSTRAINT "PK_favorite" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_favorite_userId" ON "favorite" ("userId") `
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "FK_favorite_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "FK_favorite_user"`
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_favorite_userId"`);
    await queryRunner.query(`DROP TABLE "favorite"`);
  }
}
