-- AlterTable
ALTER TABLE "invitations" ALTER COLUMN "sent_at" DROP NOT NULL,
ALTER COLUMN "sent_at" DROP DEFAULT;
