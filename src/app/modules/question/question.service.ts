import { Prisma } from "../../../generated/prisma/client.js";
import {
	AssessmentStatus,
	QuestionType,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import {
	calculatePagination,
	createPaginationMeta,
} from "../../../shared/utils/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import { getRecruiterContext } from "../recruiter/recruiter.context.js";
import { sanitizeQuestionInput } from "./question.util.js";
import {
	type CreateQuestionInput,
	createQuestionSchema,
	type QuestionListQuery,
	type UpdateQuestionInput,
} from "./question.validation.js";

const getQuestionInclude = () => ({
	options: {
		orderBy: {
			sortOrder: "asc" as const,
		},
	},
	codingTestCases: {
		orderBy: {
			sortOrder: "asc" as const,
		},
	},
	createdByRecruiter: {
		select: {
			id: true,
			user: {
				select: {
					legalName: true,
					email: true,
				},
			},
		},
	},
});

const throwQuestionValidationError = (error: {
	issues: Array<{
		path: PropertyKey[];
		message: string;
		code: string;
	}>;
}): never => {
	throw new AppError(
		400,
		"Validation failed",
		error.issues.map((issue) => ({
			path: issue.path.map(String).join("."),
			message: issue.message,
			code: issue.code,
		})),
	);
};

const parseMergedQuestion = (value: unknown): CreateQuestionInput => {
	const parsed = createQuestionSchema.safeParse(value);

	if (!parsed.success) {
		return throwQuestionValidationError(parsed.error);
	}

	return sanitizeQuestionInput(parsed.data);
};

const getOrderBy = (
	query: QuestionListQuery,
): Prisma.QuestionOrderByWithRelationInput => {
	switch (query.sortBy) {
		case "updatedAt":
			return {
				updatedAt: query.sortOrder,
			};

		case "defaultMarks":
			return {
				defaultMarks: query.sortOrder,
			};

		case "difficulty":
			return {
				difficulty: query.sortOrder,
			};

		default:
			return {
				createdAt: query.sortOrder,
			};
	}
};

const create = async (
	userId: string,
	input: CreateQuestionInput,
	ipAddress?: string,
) => {
	const normalized = sanitizeQuestionInput(input);

	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const question = await tx.question.create({
			data: {
				company: {
					connect: {
						id: recruiter.companyId,
					},
				},
				createdByRecruiter: {
					connect: {
						id: recruiter.recruiterId,
					},
				},
				type: normalized.type,
				contentHtml: normalized.contentHtml,
				difficulty: normalized.difficulty,
				defaultMarks: normalized.defaultMarks,
				evaluationRubric: normalized.evaluationRubric ?? null,
				...(normalized.type === QuestionType.MCQ
					? {
							selectionMode: normalized.selectionMode,
							options: {
								create: normalized.options.map((option) => ({
									optionHtml: option.optionHtml,
									isCorrect: option.isCorrect,
									sortOrder: option.sortOrder,
								})),
							},
						}
					: {}),
				...(normalized.type === QuestionType.CODING
					? {
							allowedLanguages: normalized.allowedLanguages,
							...(normalized.starterCode !== undefined
								? {
										starterCode:
											normalized.starterCode === null
												? Prisma.DbNull
												: normalized.starterCode,
									}
								: {}),
							timeLimitMs: normalized.timeLimitMs,
							memoryLimitKb: normalized.memoryLimitKb,
							codingTestCases: {
								create: normalized.testCases.map((testCase) => ({
									inputText: testCase.inputText ?? null,
									expectedOutput: testCase.expectedOutput,
									isHidden: testCase.isHidden,
									weight: testCase.weight,
									sortOrder: testCase.sortOrder,
								})),
							},
						}
					: {}),
			},
			include: getQuestionInclude(),
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.QUESTION_CREATED,
				entityType: AUDIT_ENTITY_TYPES.QUESTION,
				entityId: question.id,
				metadata: {
					type: question.type,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return question;
	});
};

const getAll = async (userId: string, query: QuestionListQuery) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination(query);

	const where: Prisma.QuestionWhereInput = {
		companyId: recruiter.companyId,
		deletedAt: null,
		...(query.type
			? {
					type: query.type,
				}
			: {}),
		...(query.difficulty
			? {
					difficulty: query.difficulty,
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
							contentHtml: {
								contains: query.search,
								mode: "insensitive",
							},
						},
						{
							evaluationRubric: {
								contains: query.search,
								mode: "insensitive",
							},
						},
					],
				}
			: {}),
	};

	const [questions, total] = await prisma.$transaction([
		prisma.question.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: getOrderBy(query),
			select: {
				id: true,
				type: true,
				contentHtml: true,
				difficulty: true,
				defaultMarks: true,
				evaluationRubric: true,
				selectionMode: true,
				allowedLanguages: true,
				timeLimitMs: true,
				memoryLimitKb: true,
				createdAt: true,
				updatedAt: true,
				createdByRecruiter: {
					select: {
						id: true,
						user: {
							select: {
								legalName: true,
							},
						},
					},
				},
				_count: {
					select: {
						options: true,
						codingTestCases: true,
						assessmentQuestions: true,
					},
				},
			},
		}),
		prisma.question.count({
			where,
		}),
	]);

	return {
		items: questions,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getById = async (userId: string, questionId: string) => {
	const recruiter = await getRecruiterContext(userId);

	const question = await prisma.question.findFirst({
		where: {
			id: questionId,
			companyId: recruiter.companyId,
			deletedAt: null,
		},
		include: getQuestionInclude(),
	});

	if (!question) {
		throw new AppError(404, "Question not found");
	}

	return question;
};

const update = async (
	userId: string,
	questionId: string,
	input: UpdateQuestionInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const current = await tx.question.findFirst({
			where: {
				id: questionId,
				companyId: recruiter.companyId,
				deletedAt: null,
			},
			include: {
				options: {
					orderBy: {
						sortOrder: "asc",
					},
				},
				codingTestCases: {
					orderBy: {
						sortOrder: "asc",
					},
				},
			},
		});

		if (!current) {
			throw new AppError(404, "Question not found");
		}

		if (input.type && input.type !== current.type) {
			throw new AppError(409, "Question type cannot be changed");
		}

		const lockedUsage = await tx.assessmentQuestion.findFirst({
			where: {
				questionId: current.id,
				assessment: {
					is: {
						OR: [
							{
								status: {
									not: AssessmentStatus.DRAFT,
								},
							},
							{
								creditConsumedAt: {
									not: null,
								},
							},
						],
					},
				},
			},
			select: {
				id: true,
			},
		});

		if (lockedUsage) {
			throw new AppError(
				409,
				"Question is locked because it is used by a published assessment. Duplicate it before editing.",
			);
		}

		const currentPayload: Record<string, unknown> = {
			type: current.type,
			contentHtml: current.contentHtml,
			difficulty: current.difficulty,
			defaultMarks: current.defaultMarks.toNumber(),
			evaluationRubric: current.evaluationRubric,
		};

		if (current.type === QuestionType.MCQ) {
			currentPayload.selectionMode = current.selectionMode;

			currentPayload.options = current.options.map((option) => ({
				optionHtml: option.optionHtml,
				isCorrect: option.isCorrect,
				sortOrder: option.sortOrder,
			}));
		}

		if (current.type === QuestionType.CODING) {
			currentPayload.allowedLanguages = current.allowedLanguages;

			currentPayload.starterCode = current.starterCode;

			currentPayload.timeLimitMs = current.timeLimitMs;

			currentPayload.memoryLimitKb = current.memoryLimitKb;

			currentPayload.testCases = current.codingTestCases.map((testCase) => ({
				inputText: testCase.inputText,
				expectedOutput: testCase.expectedOutput,
				isHidden: testCase.isHidden,
				weight: testCase.weight.toNumber(),
				sortOrder: testCase.sortOrder,
			}));
		}

		const merged = {
			...currentPayload,
			...input,
			type: current.type,
		};

		const normalized = parseMergedQuestion(merged);

		const data: Prisma.QuestionUpdateInput = {
			contentHtml: normalized.contentHtml,
			difficulty: normalized.difficulty,
			defaultMarks: normalized.defaultMarks,
			evaluationRubric: normalized.evaluationRubric ?? null,
		};

		if (normalized.type === QuestionType.MCQ) {
			data.selectionMode = normalized.selectionMode;

			if (input.options !== undefined) {
				data.options = {
					deleteMany: {},
					create: normalized.options.map((option) => ({
						optionHtml: option.optionHtml,
						isCorrect: option.isCorrect,
						sortOrder: option.sortOrder,
					})),
				};
			}
		}

		if (normalized.type === QuestionType.CODING) {
			data.allowedLanguages = normalized.allowedLanguages;

			data.timeLimitMs = normalized.timeLimitMs;

			data.memoryLimitKb = normalized.memoryLimitKb;

			if (input.starterCode !== undefined) {
				data.starterCode =
					normalized.starterCode === null
						? Prisma.DbNull
						: normalized.starterCode;
			}

			if (input.testCases !== undefined) {
				data.codingTestCases = {
					deleteMany: {},
					create: normalized.testCases.map((testCase) => ({
						inputText: testCase.inputText ?? null,
						expectedOutput: testCase.expectedOutput,
						isHidden: testCase.isHidden,
						weight: testCase.weight,
						sortOrder: testCase.sortOrder,
					})),
				};
			}
		}

		const question = await tx.question.update({
			where: {
				id: current.id,
			},
			data,
			include: getQuestionInclude(),
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.QUESTION_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.QUESTION,
				entityId: question.id,
				metadata: {
					fields: Object.keys(input),
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return question;
	});
};

const duplicate = async (
	userId: string,
	questionId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const source = await tx.question.findFirst({
			where: {
				id: questionId,
				companyId: recruiter.companyId,
				deletedAt: null,
			},
			include: {
				options: {
					orderBy: {
						sortOrder: "asc",
					},
				},
				codingTestCases: {
					orderBy: {
						sortOrder: "asc",
					},
				},
			},
		});

		if (!source) {
			throw new AppError(404, "Question not found");
		}

		const question = await tx.question.create({
			data: {
				company: {
					connect: {
						id: recruiter.companyId,
					},
				},
				createdByRecruiter: {
					connect: {
						id: recruiter.recruiterId,
					},
				},
				type: source.type,
				contentHtml: source.contentHtml,
				difficulty: source.difficulty,
				defaultMarks: source.defaultMarks,
				evaluationRubric: source.evaluationRubric,
				selectionMode: source.selectionMode,
				allowedLanguages: source.allowedLanguages,
				...(source.starterCode !== null
					? {
							starterCode: source.starterCode as Prisma.InputJsonValue,
						}
					: {}),
				timeLimitMs: source.timeLimitMs,
				memoryLimitKb: source.memoryLimitKb,
				...(source.options.length > 0
					? {
							options: {
								create: source.options.map((option) => ({
									optionHtml: option.optionHtml,
									isCorrect: option.isCorrect,
									sortOrder: option.sortOrder,
								})),
							},
						}
					: {}),
				...(source.codingTestCases.length > 0
					? {
							codingTestCases: {
								create: source.codingTestCases.map((testCase) => ({
									inputText: testCase.inputText,
									expectedOutput: testCase.expectedOutput,
									isHidden: testCase.isHidden,
									weight: testCase.weight,
									sortOrder: testCase.sortOrder,
								})),
							},
						}
					: {}),
			},
			include: getQuestionInclude(),
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.QUESTION_DUPLICATED,
				entityType: AUDIT_ENTITY_TYPES.QUESTION,
				entityId: question.id,
				metadata: {
					sourceQuestionId: source.id,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return question;
	});
};

const remove = async (
	userId: string,
	questionId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const question = await tx.question.findFirst({
			where: {
				id: questionId,
				companyId: recruiter.companyId,
				deletedAt: null,
			},
			select: {
				id: true,
			},
		});

		if (!question) {
			throw new AppError(404, "Question not found");
		}

		const assessmentUsage = await tx.assessmentQuestion.findFirst({
			where: {
				questionId: question.id,
			},
			select: {
				id: true,
			},
		});

		if (assessmentUsage) {
			throw new AppError(
				409,
				"Question is attached to an assessment and cannot be deleted",
			);
		}

		const deletedQuestion = await tx.question.update({
			where: {
				id: question.id,
			},
			data: {
				deletedAt: new Date(),
			},
			select: {
				id: true,
				deletedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.QUESTION_DELETED,
				entityType: AUDIT_ENTITY_TYPES.QUESTION,
				entityId: question.id,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return deletedQuestion;
	});
};

export const questionService = {
	create,
	getAll,
	getById,
	update,
	duplicate,
	remove,
};
