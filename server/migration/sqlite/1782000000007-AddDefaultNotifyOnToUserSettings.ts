import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultNotifyOnToUserSettings1782000000007 implements MigrationInterface {
  name = 'AddDefaultNotifyOnToUserSettings1782000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "defaultNotifyOn" varchar NOT NULL DEFAULT 'both'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "defaultNotifyOn"`
    );
  }
}
