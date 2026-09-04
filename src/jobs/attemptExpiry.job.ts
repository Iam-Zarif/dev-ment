import { ATTEMPT_CONSTANTS } from "../app/modules/attempt/attempt.constant.js";
import {
	AUDIT_ACTIONS,
	AUDIT_ENTITY_TYPES,
} from "../app/modules/audit/audit.constant.js";
import { auditService } from "../app/modules/audit/audit.service.js";
import { AssessmentStatus, AttemptStatus } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma/index.js";

export const autoSubmitExpiredAttempts = async (): Promise<number> => {
	const now = new Date();

	return prisma.$transaction(async (tx) => {
		const candidates = await tx.attempt.findMany({
			where: {
				status: AttemptStatus.IN_PROGRESS,
				OR: [
					{
						expiresAt: {
							lte: now,
						},
					},
					{
						invitation: {
							is: {
								application: {
									is: {
										assessment: {
											is: {
												status: {
													not: AssessmentStatus.PUBLISHED,
												},
											},
										},
									},
								},
							},
						},
					},
				],
			},
			orderBy: {
				expiresAt: "asc",
			},
			take: ATTEMPT_CONSTANTS.EXPIRY_BATCH_SIZE,
			select: {
				id: true,
			},
		});

		if (candidates.length === 0) {
			return 0;
		}

		const updated = await tx.attempt.updateManyAndReturn({
			where: {
				id: {
					in: candidates.map((attempt) => attempt.id),
				},
				status: AttemptStatus.IN_PROGRESS,
			},
			data: {
				status: AttemptStatus.AUTO_SUBMITTED,
				submittedAt: now,
			},
			select: {
				id: true,
			},
		});

		for (const attempt of updated) {
			await auditService.create(
				{
					action: AUDIT_ACTIONS.ATTEMPT_AUTO_SUBMITTED,
					entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
					entityId: attempt.id,
				},
				tx,
			);
		}

		return updated.length;
	});
};
