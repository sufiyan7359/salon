import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1782945941471 implements MigrationInterface {
  name = 'InitialSchema1782945941471';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'owner', 'staff', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phoneNumber" character varying, "name" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer', "email" character varying, "passwordHash" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6c74d862aa7ce5844d1c50924f" ON "users"  ("phoneNumber") WHERE "phoneNumber" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8aa258ebc2ca3aea796ad3f34b" ON "users"  ("email") WHERE "email" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "salons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "name" character varying NOT NULL, "address" character varying NOT NULL, "city" character varying, "geoLat" double precision, "geoLng" double precision, "description" character varying, "coverImage" character varying, "openingTime" character varying, "closingTime" character varying, "avgRating" double precision NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4cbe0adde860abd3b68b196a0b2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salonId" uuid NOT NULL, "name" character varying NOT NULL, "price" double precision NOT NULL, "durationMinutes" integer NOT NULL, "category" character varying, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "staff" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salonId" uuid NOT NULL, "userId" uuid, "name" character varying NOT NULL, "photo" character varying, "specialization" character varying, "isAvailable" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_e4ee98bb552756c180aec1e854a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('pending', 'confirmed', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salonId" uuid NOT NULL, "customerId" uuid NOT NULL, "serviceId" uuid NOT NULL, "staffId" uuid, "bookingDate" date NOT NULL, "bookingTime" character varying NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "otp_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phoneNumber" character varying NOT NULL, "otpCode" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "isVerified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_91d17e75ac3182dba6701869b39" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57598d8288e88ab88e6b6c29a8" ON "otp_verifications"  ("phoneNumber") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salonId" uuid NOT NULL, "customerId" uuid NOT NULL, "rating" integer NOT NULL, "comment" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ccd946981efce0262c56392fa2" ON "reviews"  ("salonId", "customerId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."queue_entries_status_enum" AS ENUM('waiting', 'next', 'in_service', 'completed', 'cancelled', 'no_show')`,
    );
    await queryRunner.query(
      `CREATE TABLE "queue_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "salonId" uuid NOT NULL, "customerId" uuid NOT NULL, "staffId" uuid, "tokenNumber" integer NOT NULL, "status" "public"."queue_entries_status_enum" NOT NULL DEFAULT 'waiting', "joinedAt" TIMESTAMP NOT NULL DEFAULT now(), "calledAt" TIMESTAMP, "completedAt" TIMESTAMP, "estimatedWaitMinutes" integer, CONSTRAINT "PK_8e533b14d1153fecfad7767bda5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "queue_entry_services" ("queueEntryId" uuid NOT NULL, "serviceId" uuid NOT NULL, CONSTRAINT "PK_14746714abd9e98678b4bee4329" PRIMARY KEY ("queueEntryId", "serviceId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1d8d03c1dad4bf79a8a7aebd94" ON "queue_entry_services"  ("queueEntryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_891584552128866e49cefe2ac0" ON "queue_entry_services"  ("serviceId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "salons" ADD CONSTRAINT "FK_11b5cb9ffafd9d9acdbe408e595" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_07a79176febab5096d5181f08b9" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff" ADD CONSTRAINT "FK_1f7c475ced1b6b9be4e2050ecc3" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff" ADD CONSTRAINT "FK_eba76c23bcfc9dad2479b7fd2ad" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_b3e9bf205d02dde77db3fb4b9c3" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_67b9cd20f987fc6dc70f7cd283f" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_15a2431ec10d29dcd96c9563b65" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_c3e05cfa3bde93838eb75565326" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_ea6c64d43522bf5c5cd1176ead2" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_6d99bdfa69280ede313699fab92" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" ADD CONSTRAINT "FK_d93e4bcaf9282cbeb35be9c9686" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" ADD CONSTRAINT "FK_939cc5c729e314fc372a1461f61" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" ADD CONSTRAINT "FK_5e1b322b4198f9ebf83527ef5a5" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entry_services" ADD CONSTRAINT "FK_1d8d03c1dad4bf79a8a7aebd944" FOREIGN KEY ("queueEntryId") REFERENCES "queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entry_services" ADD CONSTRAINT "FK_891584552128866e49cefe2ac09" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queue_entry_services" DROP CONSTRAINT "FK_891584552128866e49cefe2ac09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entry_services" DROP CONSTRAINT "FK_1d8d03c1dad4bf79a8a7aebd944"`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" DROP CONSTRAINT "FK_5e1b322b4198f9ebf83527ef5a5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" DROP CONSTRAINT "FK_939cc5c729e314fc372a1461f61"`,
    );
    await queryRunner.query(
      `ALTER TABLE "queue_entries" DROP CONSTRAINT "FK_d93e4bcaf9282cbeb35be9c9686"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_6d99bdfa69280ede313699fab92"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_ea6c64d43522bf5c5cd1176ead2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_c3e05cfa3bde93838eb75565326"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_15a2431ec10d29dcd96c9563b65"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_67b9cd20f987fc6dc70f7cd283f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_b3e9bf205d02dde77db3fb4b9c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff" DROP CONSTRAINT "FK_eba76c23bcfc9dad2479b7fd2ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "staff" DROP CONSTRAINT "FK_1f7c475ced1b6b9be4e2050ecc3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" DROP CONSTRAINT "FK_07a79176febab5096d5181f08b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salons" DROP CONSTRAINT "FK_11b5cb9ffafd9d9acdbe408e595"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_891584552128866e49cefe2ac0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1d8d03c1dad4bf79a8a7aebd94"`,
    );
    await queryRunner.query(`DROP TABLE "queue_entry_services"`);
    await queryRunner.query(`DROP TABLE "queue_entries"`);
    await queryRunner.query(`DROP TYPE "public"."queue_entries_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ccd946981efce0262c56392fa2"`,
    );
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_57598d8288e88ab88e6b6c29a8"`,
    );
    await queryRunner.query(`DROP TABLE "otp_verifications"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
    await queryRunner.query(`DROP TABLE "staff"`);
    await queryRunner.query(`DROP TABLE "services"`);
    await queryRunner.query(`DROP TABLE "salons"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8aa258ebc2ca3aea796ad3f34b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6c74d862aa7ce5844d1c50924f"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
