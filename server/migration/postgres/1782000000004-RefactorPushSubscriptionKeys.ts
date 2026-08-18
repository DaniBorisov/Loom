import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorPushSubscriptionKeys1782000000004 implements MigrationInterface {
  name = 'RefactorPushSubscriptionKeys1782000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old unique constraints
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP CONSTRAINT "UQ_6427d07d9a171a3a1ab87480005"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP CONSTRAINT "UQ_f90ab5a4ed54905a4bb51a7148b"`
    );
    // Drop old columns
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP COLUMN "p256dh"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP COLUMN "auth"`
    );
    // Add keys JSON column
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD COLUMN "keys" jsonb NOT NULL`
    );
    // Add global unique constraint on endpoint
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD CONSTRAINT "UQ_pushsubscription_endpoint" UNIQUE ("endpoint")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP CONSTRAINT "UQ_pushsubscription_endpoint"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" DROP COLUMN "keys"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD COLUMN "p256dh" varchar NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD COLUMN "auth" varchar NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD CONSTRAINT "UQ_6427d07d9a171a3a1ab87480005" UNIQUE ("endpoint", "userId")`
    );
    await queryRunner.query(
      `ALTER TABLE "user_push_subscription" ADD CONSTRAINT "UQ_f90ab5a4ed54905a4bb51a7148b" UNIQUE ("auth")`
    );
  }
}
