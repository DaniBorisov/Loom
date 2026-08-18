import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorPushSubscriptionKeys1782000000004 implements MigrationInterface {
  name = 'RefactorPushSubscriptionKeys1782000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SQLite: recreate table with new schema
    await queryRunner.query(
      `CREATE TABLE "temporary_user_push_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "endpoint" varchar NOT NULL, "keys" text NOT NULL, "userId" integer, "userAgent" varchar, "createdAt" datetime DEFAULT (datetime('now')), CONSTRAINT "UQ_pushsubscription_endpoint" UNIQUE ("endpoint"), CONSTRAINT "FK_user_push_subscription_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user_push_subscription"("id", "endpoint", "keys", "userId", "userAgent", "createdAt") SELECT "id", "endpoint", json_object('p256dh', "p256dh", 'auth', "auth"), "userId", "userAgent", "createdAt" FROM "user_push_subscription"`
    );
    await queryRunner.query(`DROP TABLE "user_push_subscription"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_user_push_subscription" RENAME TO "user_push_subscription"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_push_subscription_userId" ON "user_push_subscription" ("userId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_user_push_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "endpoint" varchar NOT NULL, "p256dh" varchar NOT NULL, "auth" varchar NOT NULL, "userId" integer, "userAgent" varchar, "createdAt" datetime DEFAULT (datetime('now')), CONSTRAINT "UQ_f90ab5a4ed54905a4bb51a7148b" UNIQUE ("auth"), CONSTRAINT "FK_user_push_subscription_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user_push_subscription"("id", "endpoint", "p256dh", "auth", "userId", "userAgent", "createdAt") SELECT "id", "endpoint", json_extract("keys", '$.p256dh'), json_extract("keys", '$.auth'), "userId", "userAgent", "createdAt" FROM "user_push_subscription"`
    );
    await queryRunner.query(`DROP TABLE "user_push_subscription"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_user_push_subscription" RENAME TO "user_push_subscription"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_push_subscription_userId" ON "user_push_subscription" ("userId")`
    );
  }
}
