import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueueReminderSentAt1782989185459 implements MigrationInterface {
  name = 'AddQueueReminderSentAt1782989185459';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queue_entries" ADD "reminderSentAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queue_entries" DROP COLUMN "reminderSentAt"`,
    );
  }
}
