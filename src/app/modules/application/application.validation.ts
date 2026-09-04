import { z } from "zod";
import { ApplicationStatus } from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { APPLICATION_LIMITS } from "./application.constant.js";

const applicationStatusSchema = z.enum([
	ApplicationStatus.APPLIED,
	ApplicationStatus.SHORTLISTED,
	ApplicationStatus.REJECTED,
	ApplicationStatus.INVITED,
]);

export const applyAssessmentSchema = z
	.object({
		assessmentId: z.uuid(),
		coverNote: z
			.string()
			.trim()
			.max(APPLICATION_LIMITS.COVER_NOTE_MAX_LENGTH, "Cover note is too long")
			.nullable()
			.optional(),
	})
	.strict();

export const applicationListQuerySchema = z
	.object({
		page: z.coerce
			.number()
			.int()
			.positive()
			.default(APP_CONSTANTS.DEFAULT_PAGE),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(APP_CONSTANTS.MAX_LIMIT)
			.default(APP_CONSTANTS.DEFAULT_LIMIT),
		status: applicationStatusSchema.optional(),
		assessmentId: z.uuid().optional(),
		search: z
			.string()
			.trim()
			.min(1)
			.max(APPLICATION_LIMITS.SEARCH_MAX_LENGTH)
			.optional(),
	})
	.strict();

export const rejectApplicationSchema = z
	.object({
		rejectionReason: z
			.string()
			.trim()
			.min(2, "Rejection reason must be at least 2 characters")
			.max(
				APPLICATION_LIMITS.REJECTION_REASON_MAX_LENGTH,
				"Rejection reason is too long",
			)
			.optional(),
	})
	.strict();

export type ApplyAssessmentInput = z.infer<typeof applyAssessmentSchema>;

export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;
