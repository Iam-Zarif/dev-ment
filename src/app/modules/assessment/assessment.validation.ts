import { z } from "zod";
import {
	AssessmentStatus,
	DifficultyLevel,
} from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import {
	ASSESSMENT_LIMITS,
	ASSESSMENT_SORT_FIELDS,
} from "./assessment.constant.js";

const difficultySchema = z.enum([
	DifficultyLevel.BEGINNER,
	DifficultyLevel.INTERMEDIATE,
	DifficultyLevel.ADVANCED,
]);

const statusSchema = z.enum([
	AssessmentStatus.DRAFT,
	AssessmentStatus.PUBLISHED,
	AssessmentStatus.CLOSED,
	AssessmentStatus.ARCHIVED,
]);

const dateTimeSchema = z.iso
	.datetime({
		offset: true,
	})
	.transform((value) => new Date(value));

const optionalDateTimeSchema = dateTimeSchema.nullable().optional();

const titleSchema = z
	.string()
	.trim()
	.min(2, "Assessment title must be at least 2 characters")
	.max(ASSESSMENT_LIMITS.TITLE_MAX_LENGTH, "Assessment title is too long");

const jobRoleSchema = z
	.string()
	.trim()
	.min(2, "Job role must be at least 2 characters")
	.max(ASSESSMENT_LIMITS.JOB_ROLE_MAX_LENGTH, "Job role is too long");

const optionalHtmlSchema = z
	.string()
	.trim()
	.max(ASSESSMENT_LIMITS.HTML_MAX_LENGTH, "HTML content is too long")
	.nullable()
	.optional();

const skillsSchema = z
	.array(
		z
			.string()
			.trim()
			.min(1, "Skill cannot be empty")
			.max(ASSESSMENT_LIMITS.SKILL_MAX_LENGTH, "Skill name is too long"),
	)
	.max(
		ASSESSMENT_LIMITS.MAX_SKILLS,
		`Maximum ${ASSESSMENT_LIMITS.MAX_SKILLS} skills are allowed`,
	)
	.transform((skills) => {
		const seen = new Set<string>();

		return skills.filter((skill) => {
			const key = skill.toLowerCase();

			if (seen.has(key)) {
				return false;
			}

			seen.add(key);
			return true;
		});
	});

const durationSchema = z
	.number()
	.int()
	.positive("Duration must be greater than zero")
	.max(ASSESSMENT_LIMITS.MAX_DURATION_MINUTES, "Duration is too large");

const passPercentageSchema = z
	.number()
	.positive("Pass percentage must be greater than zero")
	.max(100, "Pass percentage cannot exceed 100");

const suspiciousThresholdSchema = z
	.number()
	.int()
	.positive("Suspicious threshold must be greater than zero")
	.max(
		ASSESSMENT_LIMITS.MAX_SUSPICIOUS_THRESHOLD,
		"Suspicious threshold is too large",
	);

const validateSchedule = (
	data: {
		applicationDeadline?: Date | null;
		opensAt?: Date | null;
		closesAt?: Date | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (data.opensAt && data.closesAt && data.opensAt >= data.closesAt) {
		ctx.addIssue({
			code: "custom",
			path: ["closesAt"],
			message: "closesAt must be after opensAt",
		});
	}

	if (
		data.applicationDeadline &&
		data.closesAt &&
		data.applicationDeadline > data.closesAt
	) {
		ctx.addIssue({
			code: "custom",
			path: ["applicationDeadline"],
			message: "Application deadline cannot be after assessment closing time",
		});
	}
};

export const createAssessmentSchema = z
	.object({
		title: titleSchema,
		jobRole: jobRoleSchema,
		descriptionHtml: optionalHtmlSchema,
		instructionsHtml: optionalHtmlSchema,
		skills: skillsSchema.default([]),
		difficulty: difficultySchema.default(DifficultyLevel.INTERMEDIATE),
		applicationDeadline: optionalDateTimeSchema,
		opensAt: optionalDateTimeSchema,
		closesAt: optionalDateTimeSchema,
		durationMinutes: durationSchema,
		passPercentage: passPercentageSchema.default(50),
		suspiciousThreshold: suspiciousThresholdSchema.default(3),
	})
	.strict()
	.superRefine(validateSchedule);

export const updateAssessmentSchema = z
	.object({
		title: titleSchema.optional(),
		jobRole: jobRoleSchema.optional(),
		descriptionHtml: optionalHtmlSchema,
		instructionsHtml: optionalHtmlSchema,
		skills: skillsSchema.optional(),
		difficulty: difficultySchema.optional(),
		applicationDeadline: optionalDateTimeSchema,
		opensAt: optionalDateTimeSchema,
		closesAt: optionalDateTimeSchema,
		durationMinutes: durationSchema.optional(),
		passPercentage: passPercentageSchema.optional(),
		suspiciousThreshold: suspiciousThresholdSchema.optional(),
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	})
	.superRefine(validateSchedule);

export const assessmentListQuerySchema = z
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
		search: z
			.string()
			.trim()
			.min(1)
			.max(ASSESSMENT_LIMITS.SEARCH_MAX_LENGTH)
			.optional(),
		status: statusSchema.optional(),
		difficulty: difficultySchema.optional(),
		sortBy: z.enum(ASSESSMENT_SORT_FIELDS).default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export const attachAssessmentQuestionSchema = z
	.object({
		questionId: z.uuid(),
		marks: z
			.number()
			.positive("Marks must be greater than zero")
			.max(ASSESSMENT_LIMITS.MAX_MARKS),
		sortOrder: z.number().int().positive().optional(),
	})
	.strict();

export const updateAssessmentQuestionSchema = z
	.object({
		marks: z
			.number()
			.positive("Marks must be greater than zero")
			.max(ASSESSMENT_LIMITS.MAX_MARKS),
	})
	.strict();

export const reorderAssessmentQuestionsSchema = z
	.object({
		assessmentQuestionIds: z
			.array(z.uuid())
			.min(1, "At least one assessment question is required")
			.max(ASSESSMENT_LIMITS.MAX_QUESTIONS)
			.refine((ids) => new Set(ids).size === ids.length, {
				message: "Assessment question IDs must be unique",
			}),
	})
	.strict();

export const assessmentQuestionParamsSchema = z.object({
	id: z.uuid(),
	assessmentQuestionId: z.uuid(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

export type AssessmentListQuery = z.infer<typeof assessmentListQuerySchema>;

export type AttachAssessmentQuestionInput = z.infer<
	typeof attachAssessmentQuestionSchema
>;

export type UpdateAssessmentQuestionInput = z.infer<
	typeof updateAssessmentQuestionSchema
>;

export type ReorderAssessmentQuestionsInput = z.infer<
	typeof reorderAssessmentQuestionsSchema
>;

export const publishedAssessmentListQuerySchema = z
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
		search: z
			.string()
			.trim()
			.min(1)
			.max(ASSESSMENT_LIMITS.SEARCH_MAX_LENGTH)
			.optional(),
		difficulty: difficultySchema.optional(),
	})
	.strict();

export type PublishedAssessmentListQuery = z.infer<
	typeof publishedAssessmentListQuerySchema
>;
