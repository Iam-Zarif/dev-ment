import { z } from "zod";
import {
	DifficultyLevel,
	McqSelectionMode,
	QuestionType,
} from "../../../generated/prisma/enums.js";
import { APP_CONSTANTS } from "../../../shared/constants/index.js";
import { QUESTION_LIMITS, QUESTION_SORT_FIELDS } from "./question.constant.js";

const difficultySchema = z.enum([
	DifficultyLevel.BEGINNER,
	DifficultyLevel.INTERMEDIATE,
	DifficultyLevel.ADVANCED,
]);

const questionTypeSchema = z.enum([
	QuestionType.MCQ,
	QuestionType.SHORT_TEXT,
	QuestionType.LONG_TEXT,
	QuestionType.CODING,
]);

const selectionModeSchema = z.enum([
	McqSelectionMode.SINGLE,
	McqSelectionMode.MULTIPLE,
]);

const contentHtmlSchema = z
	.string()
	.trim()
	.min(1, "Question content is required")
	.max(QUESTION_LIMITS.CONTENT_HTML_MAX_LENGTH, "Question content is too long");

const evaluationRubricSchema = z
	.string()
	.trim()
	.max(QUESTION_LIMITS.RUBRIC_MAX_LENGTH, "Evaluation rubric is too long")
	.nullable()
	.optional();

const defaultMarksSchema = z
	.number()
	.positive("Default marks must be greater than zero")
	.max(QUESTION_LIMITS.MAX_DEFAULT_MARKS, "Default marks is too large");

const optionSchema = z
	.object({
		optionHtml: z
			.string()
			.trim()
			.min(1, "Option content is required")
			.max(
				QUESTION_LIMITS.OPTION_HTML_MAX_LENGTH,
				"Option content is too long",
			),
		isCorrect: z.boolean().default(false),
		sortOrder: z.number().int().positive("Option sort order must be positive"),
	})
	.strict();

const optionsSchema = z
	.array(optionSchema)
	.min(2, "At least two options are required")
	.max(
		QUESTION_LIMITS.MAX_OPTIONS,
		`Maximum ${QUESTION_LIMITS.MAX_OPTIONS} options are allowed`,
	)
	.superRefine((options, ctx) => {
		const sortOrders = options.map((option) => option.sortOrder);

		if (new Set(sortOrders).size !== sortOrders.length) {
			ctx.addIssue({
				code: "custom",
				message: "Option sort orders must be unique",
			});
		}
	});

const languageSchema = z
	.string()
	.trim()
	.min(1, "Language is required")
	.max(50, "Language name is too long")
	.transform((value) => value.toLowerCase());

const starterCodeSchema = z
	.record(
		z.string(),
		z
			.string()
			.max(QUESTION_LIMITS.STARTER_CODE_MAX_LENGTH, "Starter code is too long"),
	)
	.nullable()
	.optional();

const codingTestCaseSchema = z
	.object({
		inputText: z
			.string()
			.max(
				QUESTION_LIMITS.TEST_CASE_TEXT_MAX_LENGTH,
				"Test case input is too long",
			)
			.nullable()
			.optional(),
		expectedOutput: z
			.string()
			.max(
				QUESTION_LIMITS.TEST_CASE_TEXT_MAX_LENGTH,
				"Expected output is too long",
			),
		isHidden: z.boolean().default(true),
		weight: z
			.number()
			.positive("Test case weight must be greater than zero")
			.default(1),
		sortOrder: z
			.number()
			.int()
			.positive("Test case sort order must be positive"),
	})
	.strict();

const codingTestCasesSchema = z
	.array(codingTestCaseSchema)
	.min(1, "At least one coding test case is required")
	.max(
		QUESTION_LIMITS.MAX_TEST_CASES,
		`Maximum ${QUESTION_LIMITS.MAX_TEST_CASES} test cases are allowed`,
	)
	.superRefine((testCases, ctx) => {
		const sortOrders = testCases.map((testCase) => testCase.sortOrder);

		if (new Set(sortOrders).size !== sortOrders.length) {
			ctx.addIssue({
				code: "custom",
				message: "Test case sort orders must be unique",
			});
		}
	});

const mcqQuestionSchema = z
	.object({
		type: z.literal(QuestionType.MCQ),
		contentHtml: contentHtmlSchema,
		difficulty: difficultySchema.default(DifficultyLevel.INTERMEDIATE),
		defaultMarks: defaultMarksSchema,
		evaluationRubric: evaluationRubricSchema,
		selectionMode: selectionModeSchema,
		options: optionsSchema,
	})
	.strict()
	.superRefine((data, ctx) => {
		const correctOptions = data.options.filter((option) => option.isCorrect);

		if (
			data.selectionMode === McqSelectionMode.SINGLE &&
			correctOptions.length !== 1
		) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "SINGLE MCQ must have exactly one correct option",
			});
		}

		if (
			data.selectionMode === McqSelectionMode.MULTIPLE &&
			correctOptions.length < 1
		) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "MULTIPLE MCQ must have at least one correct option",
			});
		}
	});

const shortTextQuestionSchema = z
	.object({
		type: z.literal(QuestionType.SHORT_TEXT),
		contentHtml: contentHtmlSchema,
		difficulty: difficultySchema.default(DifficultyLevel.INTERMEDIATE),
		defaultMarks: defaultMarksSchema,
		evaluationRubric: evaluationRubricSchema,
	})
	.strict();

const longTextQuestionSchema = z
	.object({
		type: z.literal(QuestionType.LONG_TEXT),
		contentHtml: contentHtmlSchema,
		difficulty: difficultySchema.default(DifficultyLevel.INTERMEDIATE),
		defaultMarks: defaultMarksSchema,
		evaluationRubric: evaluationRubricSchema,
	})
	.strict();

const codingQuestionSchema = z
	.object({
		type: z.literal(QuestionType.CODING),
		contentHtml: contentHtmlSchema,
		difficulty: difficultySchema.default(DifficultyLevel.INTERMEDIATE),
		defaultMarks: defaultMarksSchema,
		evaluationRubric: evaluationRubricSchema,
		allowedLanguages: z
			.array(languageSchema)
			.min(1, "At least one programming language is required")
			.max(
				QUESTION_LIMITS.MAX_LANGUAGES,
				`Maximum ${QUESTION_LIMITS.MAX_LANGUAGES} languages are allowed`,
			),
		starterCode: starterCodeSchema,
		timeLimitMs: z
			.number()
			.int()
			.min(QUESTION_LIMITS.MIN_TIME_LIMIT_MS)
			.max(QUESTION_LIMITS.MAX_TIME_LIMIT_MS),
		memoryLimitKb: z
			.number()
			.int()
			.min(QUESTION_LIMITS.MIN_MEMORY_LIMIT_KB)
			.max(QUESTION_LIMITS.MAX_MEMORY_LIMIT_KB),
		testCases: codingTestCasesSchema,
	})
	.strict()
	.superRefine((data, ctx) => {
		if (new Set(data.allowedLanguages).size !== data.allowedLanguages.length) {
			ctx.addIssue({
				code: "custom",
				path: ["allowedLanguages"],
				message: "Allowed languages must be unique",
			});
		}

		if (data.starterCode) {
			for (const language of Object.keys(data.starterCode)) {
				if (!data.allowedLanguages.includes(language.toLowerCase())) {
					ctx.addIssue({
						code: "custom",
						path: ["starterCode", language],
						message: "Starter code language must exist in allowedLanguages",
					});
				}
			}
		}
	});

export const createQuestionSchema = z.discriminatedUnion("type", [
	mcqQuestionSchema,
	shortTextQuestionSchema,
	longTextQuestionSchema,
	codingQuestionSchema,
]);

export const updateQuestionSchema = z
	.object({
		type: questionTypeSchema.optional(),
		contentHtml: contentHtmlSchema.optional(),
		difficulty: difficultySchema.optional(),
		defaultMarks: defaultMarksSchema.optional(),
		evaluationRubric: evaluationRubricSchema,
		selectionMode: selectionModeSchema.optional(),
		options: optionsSchema.optional(),
		allowedLanguages: z
			.array(languageSchema)
			.min(1)
			.max(QUESTION_LIMITS.MAX_LANGUAGES)
			.optional(),
		starterCode: starterCodeSchema,
		timeLimitMs: z
			.number()
			.int()
			.min(QUESTION_LIMITS.MIN_TIME_LIMIT_MS)
			.max(QUESTION_LIMITS.MAX_TIME_LIMIT_MS)
			.optional(),
		memoryLimitKb: z
			.number()
			.int()
			.min(QUESTION_LIMITS.MIN_MEMORY_LIMIT_KB)
			.max(QUESTION_LIMITS.MAX_MEMORY_LIMIT_KB)
			.optional(),
		testCases: codingTestCasesSchema.optional(),
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export const questionListQuerySchema = z
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
		search: z.string().trim().min(1).max(200).optional(),
		type: questionTypeSchema.optional(),
		difficulty: difficultySchema.optional(),
		sortBy: z.enum(QUESTION_SORT_FIELDS).default("createdAt"),
		sortOrder: z.enum(["asc", "desc"]).default("desc"),
	})
	.strict();

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;
