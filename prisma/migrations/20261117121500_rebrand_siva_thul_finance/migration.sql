ALTER TABLE "AppSettings" ALTER COLUMN "businessName" SET DEFAULT 'Siva Thul Finance';

UPDATE "AppSettings"
SET "businessName" = 'Siva Thul Finance'
WHERE "id" = 'singleton' AND "businessName" = 'Thavanai Manager';
