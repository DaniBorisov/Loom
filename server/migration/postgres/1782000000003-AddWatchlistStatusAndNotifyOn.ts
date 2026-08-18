import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWatchlistStatusAndNotifyOn1782000000003 implements MigrationInterface {
  name = 'AddWatchlistStatusAndNotifyOn1782000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "status" varchar NOT NULL DEFAULT 'want_to_watch'`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "notifyOn" varchar NOT NULL DEFAULT 'both'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "notifyOn"`);
    await queryRunner.query(`ALTER TABLE "watchlist" DROP COLUMN "status"`);
  }
}
