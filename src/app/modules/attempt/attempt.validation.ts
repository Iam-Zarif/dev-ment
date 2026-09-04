import { z } from "zod";
import { ProctorEventType } from "../../../generated/prisma/enums.js";
import { ATTEMPT_CONSTANTS } from "./attempt.constant.js";

export const startAttemptSchema = z
	.object({
		invitationId: z.uuid(),
	})
	.strict();

const mcqAnswerSchema = z
	.object({
		selectedOptionIds: z
			.array(z.uuid())
			.max(ATTEMPT_CONSTANTS.MAX_SELECTED_OPTIONS, "Too many selected options")
			.refine((ids) => new Set(ids).size === ids.length, {
				message: "Selected option IDs must be unique",
			}),
	})
	.strict();

const textAnswerSchema = z
	.object({
		answerText: z
			.string()
			.max(ATTEMPT_CONSTANTS.MAX_TEXT_ANSWER_LENGTH, "Answer text is too long"),
	})
	.strict();

const codingAnswerSchema = z
	.object({
		codeAnswer: z
			.string()
			.max(ATTEMPT_CONSTANTS.MAX_CODE_ANSWER_LENGTH, "Code answer is too long"),
		language: z
			.string()
			.trim()
			.min(1, "Programming language is required")
			.max(
				ATTEMPT_CONSTANTS.MAX_LANGUAGE_LENGTH,
				"Programming language is too long",
			)
			.transform((value) => value.toLowerCase()),
	})
	.strict();

export const saveAnswerSchema = z.union([
	mcqAnswerSchema,
	textAnswerSchema,
	codingAnswerSchema,
]);

export const attemptAnswerParamsSchema = z.object({
	id: z.uuid(),
	assessmentQuestionId: z.uuid(),
});

export const proctorEventSchema = z
	.object({
		clientEventId: z.uuid(),
		eventType: z.enum([
			ProctorEventType.TAB_HIDDEN,
			ProctorEventType.WINDOW_BLUR,
			ProctorEventType.FULLSCREEN_EXIT,
		]),
		occurredAt: z.iso
			.datetime({
				offset: true,
			})
			.transform((value) => new Date(value)),
		metadata: z.record(z.string(), z.json()).optional(),
	})
	.strict();

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export type ProctorEventInput = z.infer<typeof proctorEventSchema>;
