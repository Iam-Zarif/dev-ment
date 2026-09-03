import type { Prisma } from "../../../generated/prisma/client.js";
import type { CreditSource } from "../../../generated/prisma/enums.js";
import { AppError } from "../../../shared/errors/index.js";

type LockedCreditGrant = {
	id: string;
	remaining_credits: number;
	source: CreditSource;
	expires_at: Date | null;
};

export const consumeAssessmentCredit = async (
	tx: Prisma.TransactionClient,
	recruiterId: string,
) => {
	const [grant] = await tx.$queryRaw<LockedCreditGrant[]>`
				SELECT
					"id",
					"remaining_credits",
					"source",
					"expires_at"
				FROM "credit_grants"
				WHERE
					"recruiter_id" = ${recruiterId}::uuid
					AND "remaining_credits" > 0
					AND (
						"expires_at" IS NULL
						OR "expires_at" > NOW()
					)
				ORDER BY
					CASE
						WHEN "source" = 'FREE' THEN 2
						WHEN "expires_at" IS NULL THEN 1
						ELSE 0
					END ASC,
					"expires_at" ASC NULLS LAST,
					"created_at" ASC
				LIMIT 1
				FOR UPDATE
			`;

	if (!grant) {
		throw new AppError(409, "No assessment credits are available");
	}

	const updatedGrant = await tx.creditGrant.update({
		where: {
			id: grant.id,
		},
		data: {
			remainingCredits: {
				decrement: 1,
			},
		},
		select: {
			id: true,
			source: true,
			totalCredits: true,
			remainingCredits: true,
			expiresAt: true,
		},
	});

	return updatedGrant;
};
