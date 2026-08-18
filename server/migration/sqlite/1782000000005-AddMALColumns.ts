import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMALColumns1782000000005 implements MigrationInterface {
  name = 'AddMALColumns1782000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "malUserId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "malUsername" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "malAccessToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "malRefreshToken" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "malTokenExpiresAt" datetime`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "externalSource" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "externalId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "malOriginalStatus" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "malSyncEnabled" boolean`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "malSyncEnabled"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP COLUMN "malOriginalStatus"`
    );
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "externalId"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP COLUMN "externalSource"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "malTokenExpiresAt"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "malRefreshToken"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "malAccessToken"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "malUsername"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "malUserId"`);
  }
}
