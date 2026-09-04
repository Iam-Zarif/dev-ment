import { z } from "zod";
import { EvaluationStatus } from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { EVALUATION_CONSTANTS } from "./evaluation.constant.js";

const evaluationStatusSchema = z.enum([
	EvaluationStatus.PENDING,
	EvaluationStatus.PARTIAL,
	EvaluationStatus.EVALUATED,
	EvaluationStatus.FINALIZED,
]);

export const evaluationListQuerySchema = z
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
		assessmentId: z.uuid().optional(),
		status: evaluationStatusSchema.optional(),
		isSuspicious: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		search: z
			.string()
			.trim()
			.min(1)
			.max(EVALUATION_CONSTANTS.SEARCH_MAX_LENGTH)
			.optional(),
	})
	.strict();

export const evaluationQuestionParamsSchema = z.object({
	id: z.uuid(),
	assessmentQuestionId: z.uuid(),
});

export const manualEvaluationSchema = z
	.object({
		manualScore: z.number().min(0, "Manual score cannot be negative"),
		recruiterFeedback: z
			.string()
			.trim()
			.max(
				EVALUATION_CONSTANTS.MAX_FEEDBACK_LENGTH,
				"Recruiter feedback is too long",
			)
			.nullable()
			.optional(),
	})
	.strict();

export const finalizeEvaluationSchema = z
	.object({
		finalFeedback: z
			.string()
			.trim()
			.max(
				EVALUATION_CONSTANTS.MAX_FEEDBACK_LENGTH,
				"Final feedback is too long",
			)
			.nullable()
			.optional(),
	})
	.strict();

export type EvaluationListQuery = z.infer<typeof evaluationListQuerySchema>;

export type ManualEvaluationInput = z.infer<typeof manualEvaluationSchema>;

export type FinalizeEvaluationInput = z.infer<typeof finalizeEvaluationSchema>;
