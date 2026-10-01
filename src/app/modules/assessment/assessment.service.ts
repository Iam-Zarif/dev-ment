import type { Prisma } from "../../../generated/prisma/client.js";
import {
	AssessmentStatus,
	DifficultyLevel,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import type { ApiErrorDetail } from "../../../shared/types/index.js";
import {
	calculatePagination,
	createPaginationMeta,
} from "../../../shared/utils/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import {
	getRecruiterContext,
	type RecruiterContext,
} from "../recruiter/recruiter.context.js";
import { consumeAssessmentCredit } from "./assessment.credit.js";
import {
	assertAssessmentSchedule,
	sanitizeOptionalAssessmentHtml,
} from "./assessment.util.js";
import type {
	AssessmentListQuery,
	AttachAssessmentQuestionInput,
	CreateAssessmentDraftInput,
	CreateAssessmentInput,
	PublishedAssessmentListQuery,
	ReorderAssessmentQuestionsInput,
	SyncAssessmentDraftInput,
	UpdateAssessmentInput,
	UpdateAssessmentQuestionInput,
} from "./assessment.validation.js";

type LockedAssessment = {
	id: string;
	status: AssessmentStatus;
	credit_consumed_at: Date | null;
};

const lockOwnedAssessment = async (
	tx: Prisma.TransactionClient,
	recruiter: RecruiterContext,
	assessmentId: string,
): Promise<LockedAssessment> => {
	const [assessment] = await tx.$queryRaw<LockedAssessment[]>`
			SELECT
				"id",
				"status",
				"credit_consumed_at"
			FROM "assessments"
			WHERE
				"id" = ${assessmentId}::uuid
				AND "recruiter_id" = ${recruiter.recruiterId}::uuid
				AND "company_id" = ${recruiter.companyId}::uuid
				AND "deleted_at" IS NULL
			FOR UPDATE
		`;

	if (!assessment) {
		throw new AppError(404, "Assessment not found");
	}

	return assessment;
};

const ensureDraft = (assessment: LockedAssessment) => {
	if (
		assessment.status !== AssessmentStatus.DRAFT ||
		assessment.credit_consumed_at
	) {
		throw new AppError(409, "Only draft assessments can be modified");
	}
};

type PublishReadinessAssessment = {
	title: string;
	jobRole: string;
	durationMinutes: number;
	passPercentage: number | { toNumber(): number };
	suspiciousThreshold: number;
	applicationDeadline: Date | null;
	opensAt: Date | null;
	closesAt: Date | null;
	assessmentQuestions: Array<{
		marks: number | { toNumber(): number };
		question: {
			companyId: string;
			deletedAt: Date | null;
		};
	}>;
};

const numericValue = (value: number | { toNumber(): number }): number =>
	typeof value === "number" ? value : value.toNumber();

const getPublishValidationIssues = (
	assessment: PublishReadinessAssessment,
	companyId: string,
): ApiErrorDetail[] => {
	const issues: ApiErrorDetail[] = [];

	if (assessment.title.trim().length < 2) {
		issues.push({
			path: "title",
			code: "ASSESSMENT_TITLE_REQUIRED",
			message: "Assessment title must be at least 2 characters",
		});
	}

	if (assessment.jobRole.trim().length < 2) {
		issues.push({
			path: "jobRole",
			code: "ASSESSMENT_JOB_ROLE_REQUIRED",
			message: "Job role must be at least 2 characters",
		});
	}

	if (assessment.durationMinutes <= 0) {
		issues.push({
			path: "durationMinutes",
			code: "ASSESSMENT_DURATION_REQUIRED",
			message: "Duration must be greater than zero",
		});
	}

	const passPercentage = numericValue(assessment.passPercentage);
	if (passPercentage <= 0 || passPercentage > 100) {
		issues.push({
			path: "passPercentage",
			code: "ASSESSMENT_PASS_PERCENTAGE_INVALID",
			message: "Pass percentage must be greater than zero and at most 100",
		});
	}

	if (assessment.suspiciousThreshold <= 0) {
		issues.push({
			path: "suspiciousThreshold",
			code: "ASSESSMENT_SUSPICIOUS_THRESHOLD_INVALID",
			message: "Suspicious threshold must be greater than zero",
		});
	}

	if (
		assessment.opensAt &&
		assessment.closesAt &&
		assessment.opensAt >= assessment.closesAt
	) {
		issues.push({
			path: "closesAt",
			code: "ASSESSMENT_SCHEDULE_INVALID",
			message: "closesAt must be after opensAt",
		});
	}

	if (
		assessment.applicationDeadline &&
		assessment.closesAt &&
		assessment.applicationDeadline > assessment.closesAt
	) {
		issues.push({
			path: "applicationDeadline",
			code: "ASSESSMENT_APPLICATION_DEADLINE_INVALID",
			message: "Application deadline cannot be after assessment closing time",
		});
	}

	if (assessment.assessmentQuestions.length === 0) {
		issues.push({
			path: "assessmentQuestions",
			code: "ASSESSMENT_QUESTION_REQUIRED",
			message: "Assessment must contain at least one question before publishing",
		});
	} else {
		const invalidQuestionIndex = assessment.assessmentQuestions.findIndex(
			(item) =>
				item.question.deletedAt !== null ||
				item.question.companyId !== companyId ||
				numericValue(item.marks) <= 0,
		);

		if (invalidQuestionIndex >= 0) {
			issues.push({
				path: `assessmentQuestions.${invalidQuestionIndex}`,
				code: "ASSESSMENT_QUESTION_INVALID",
				message: "Assessment contains an invalid or unavailable question",
			});
		}
	}

	return issues;
};

const createPublishReadiness = (
	assessment: PublishReadinessAssessment,
	companyId: string,
) => {
	const issues = getPublishValidationIssues(assessment, companyId);

	return {
		canPublish: issues.length === 0,
		issues,
	};
};

const createSaveState = (
	savedAt: Date,
	mode: "AUTO" | "MANUAL",
) => ({
	state: "SAVED" as const,
	mode,
	savedAt,
});

const getOrderBy = (
	query: AssessmentListQuery,
): Prisma.AssessmentOrderByWithRelationInput => {
	switch (query.sortBy) {
		case "updatedAt":
			return {
				updatedAt: query.sortOrder,
			};

		case "title":
			return {
				title: query.sortOrder,
			};

		case "applicationDeadline":
			return {
				applicationDeadline: query.sortOrder,
			};

		case "opensAt":
			return {
				opensAt: query.sortOrder,
			};

		default:
			return {
				createdAt: query.sortOrder,
			};
	}
};

const create = async (
	userId: string,
	input: CreateAssessmentInput,
	ipAddress?: string,
) => {
	assertAssessmentSchedule(input);

	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const assessment = await tx.assessment.create({
			data: {
				recruiter: {
					connect: {
						id: recruiter.recruiterId,
					},
				},
				company: {
					connect: {
						id: recruiter.companyId,
					},
				},
				title: input.title,
				jobRole: input.jobRole,
				descriptionHtml:
					sanitizeOptionalAssessmentHtml(input.descriptionHtml) ?? null,
				instructionsHtml:
					sanitizeOptionalAssessmentHtml(input.instructionsHtml) ?? null,
				skills: input.skills,
				difficulty: input.difficulty,
				status: AssessmentStatus.DRAFT,
				applicationDeadline: input.applicationDeadline ?? null,
				opensAt: input.opensAt ?? null,
				closesAt: input.closesAt ?? null,
				durationMinutes: input.durationMinutes,
				passPercentage: input.passPercentage,
				suspiciousThreshold: input.suspiciousThreshold,
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				status: true,
				difficulty: true,
				skills: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				createdAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_CREATED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessment.id,
				metadata: {
					title: assessment.title,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return assessment;
	});
};

const createDraft = async (
	userId: string,
	input: CreateAssessmentDraftInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const assessment = await tx.assessment.create({
			data: {
				recruiter: {
					connect: {
						id: recruiter.recruiterId,
					},
				},
				company: {
					connect: {
						id: recruiter.companyId,
					},
				},
				title: input.title ?? "",
				jobRole: input.jobRole ?? "",
				descriptionHtml:
					sanitizeOptionalAssessmentHtml(input.descriptionHtml) ?? null,
				instructionsHtml:
					sanitizeOptionalAssessmentHtml(input.instructionsHtml) ?? null,
				skills: input.skills ?? [],
				difficulty: input.difficulty ?? DifficultyLevel.INTERMEDIATE,
				status: AssessmentStatus.DRAFT,
				applicationDeadline: input.applicationDeadline ?? null,
				opensAt: input.opensAt ?? null,
				closesAt: input.closesAt ?? null,
				durationMinutes: input.durationMinutes ?? 0,
				passPercentage: input.passPercentage ?? 50,
				suspiciousThreshold: input.suspiciousThreshold ?? 3,
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				descriptionHtml: true,
				instructionsHtml: true,
				skills: true,
				difficulty: true,
				status: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				createdAt: true,
				updatedAt: true,
				assessmentQuestions: {
					select: {
						marks: true,
						question: {
							select: {
								companyId: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_CREATED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessment.id,
				metadata: {
					title: assessment.title,
					draft: true,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return {
			...assessment,
			saveState: createSaveState(assessment.updatedAt, "AUTO"),
			publishReadiness: createPublishReadiness(
				assessment,
				recruiter.companyId,
			),
		};
	});
};

const getAll = async (userId: string, query: AssessmentListQuery) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination(query);

	const where: Prisma.AssessmentWhereInput = {
		recruiterId: recruiter.recruiterId,
		companyId: recruiter.companyId,
		deletedAt: null,
		...(query.status
			? {
					status: query.status,
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
							title: {
								contains: query.search,
								mode: "insensitive",
							},
						},
						{
							jobRole: {
								contains: query.search,
								mode: "insensitive",
							},
						},
					],
				}
			: {}),
	};

	const [assessments, total] = await prisma.$transaction([
		prisma.assessment.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: getOrderBy(query),
			select: {
				id: true,
				title: true,
				jobRole: true,
				skills: true,
				difficulty: true,
				status: true,
				durationMinutes: true,
				passPercentage: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				creditConsumedAt: true,
				publishedAt: true,
				closedAt: true,
				createdAt: true,
				updatedAt: true,
				_count: {
					select: {
						assessmentQuestions: true,
						applications: true,
					},
				},
			},
		}),
		prisma.assessment.count({
			where,
		}),
	]);

	return {
		items: assessments,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getById = async (userId: string, assessmentId: string) => {
	const recruiter = await getRecruiterContext(userId);

	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			recruiterId: recruiter.recruiterId,
			companyId: recruiter.companyId,
			deletedAt: null,
		},
		include: {
			company: {
				select: {
					id: true,
					name: true,
					domain: true,
				},
			},
			creditGrant: {
				select: {
					id: true,
					source: true,
					remainingCredits: true,
					expiresAt: true,
				},
			},
			assessmentQuestions: {
				orderBy: {
					sortOrder: "asc",
				},
				include: {
					question: {
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
					},
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(404, "Assessment not found");
	}

	const totalMarks = assessment.assessmentQuestions.reduce(
		(total, item) => total + item.marks.toNumber(),
		0,
	);

	return {
		...assessment,
		totalMarks,
		publishReadiness:
			assessment.status === AssessmentStatus.DRAFT
				? createPublishReadiness(assessment, recruiter.companyId)
				: null,
	};
};

const update = async (
	userId: string,
	assessmentId: string,
	input: UpdateAssessmentInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const current = await tx.assessment.findUnique({
			where: {
				id: assessmentId,
			},
			select: {
				title: true,
				jobRole: true,
				descriptionHtml: true,
				instructionsHtml: true,
				skills: true,
				difficulty: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
			},
		});

		if (!current) {
			throw new AppError(404, "Assessment not found");
		}

		const applicationDeadline =
			input.applicationDeadline === undefined
				? current.applicationDeadline
				: input.applicationDeadline;

		const opensAt =
			input.opensAt === undefined ? current.opensAt : input.opensAt;

		const closesAt =
			input.closesAt === undefined ? current.closesAt : input.closesAt;

		assertAssessmentSchedule({
			applicationDeadline,
			opensAt,
			closesAt,
		});

		const assessment = await tx.assessment.update({
			where: {
				id: assessmentId,
			},
			data: {
				title: input.title ?? current.title,
				jobRole: input.jobRole ?? current.jobRole,
				descriptionHtml:
					input.descriptionHtml === undefined
						? current.descriptionHtml
						: (sanitizeOptionalAssessmentHtml(input.descriptionHtml) ?? null),
				instructionsHtml:
					input.instructionsHtml === undefined
						? current.instructionsHtml
						: (sanitizeOptionalAssessmentHtml(input.instructionsHtml) ?? null),
				skills: input.skills ?? current.skills,
				difficulty: input.difficulty ?? current.difficulty,
				applicationDeadline,
				opensAt,
				closesAt,
				durationMinutes: input.durationMinutes ?? current.durationMinutes,
				passPercentage: input.passPercentage ?? current.passPercentage,
				suspiciousThreshold:
					input.suspiciousThreshold ?? current.suspiciousThreshold,
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				skills: true,
				difficulty: true,
				status: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				updatedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessment.id,
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

		return assessment;
	});
};

const syncDraft = async (
	userId: string,
	assessmentId: string,
	input: SyncAssessmentDraftInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);
		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const data: Prisma.AssessmentUpdateInput = {
			updatedAt: new Date(),
		};

		if (input.title !== undefined) data.title = input.title;
		if (input.jobRole !== undefined) data.jobRole = input.jobRole;
		if (input.descriptionHtml !== undefined) {
			data.descriptionHtml =
				sanitizeOptionalAssessmentHtml(input.descriptionHtml) ?? null;
		}
		if (input.instructionsHtml !== undefined) {
			data.instructionsHtml =
				sanitizeOptionalAssessmentHtml(input.instructionsHtml) ?? null;
		}
		if (input.skills !== undefined) data.skills = input.skills;
		if (input.difficulty !== undefined) data.difficulty = input.difficulty;
		if (input.applicationDeadline !== undefined) {
			data.applicationDeadline = input.applicationDeadline;
		}
		if (input.opensAt !== undefined) data.opensAt = input.opensAt;
		if (input.closesAt !== undefined) data.closesAt = input.closesAt;
		if (input.durationMinutes !== undefined) {
			data.durationMinutes = input.durationMinutes;
		}
		if (input.passPercentage !== undefined) {
			data.passPercentage = input.passPercentage;
		}
		if (input.suspiciousThreshold !== undefined) {
			data.suspiciousThreshold = input.suspiciousThreshold;
		}

		const assessment = await tx.assessment.update({
			where: {
				id: assessmentId,
			},
			data,
			select: {
				id: true,
				title: true,
				jobRole: true,
				descriptionHtml: true,
				instructionsHtml: true,
				skills: true,
				difficulty: true,
				status: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				updatedAt: true,
				assessmentQuestions: {
					select: {
						marks: true,
						question: {
							select: {
								companyId: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		if (input.saveMode === "MANUAL") {
			await auditService.create(
				{
					actorUserId: userId,
					action: AUDIT_ACTIONS.ASSESSMENT_UPDATED,
					entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
					entityId: assessment.id,
					metadata: {
						fields: Object.keys(input).filter(
							(field) => field !== "saveMode",
						),
						saveMode: input.saveMode,
					},
					...(ipAddress
						? {
								ipAddress,
							}
						: {}),
				},
				tx,
			);
		}

		return {
			id: assessment.id,
			status: assessment.status,
			updatedAt: assessment.updatedAt,
			saveState: createSaveState(assessment.updatedAt, input.saveMode),
			publishReadiness: createPublishReadiness(
				assessment,
				recruiter.companyId,
			),
		};
	});
};

const addQuestion = async (
	userId: string,
	assessmentId: string,
	input: AttachAssessmentQuestionInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const question = await tx.question.findFirst({
			where: {
				id: input.questionId,
				companyId: recruiter.companyId,
				deletedAt: null,
			},
			select: {
				id: true,
				type: true,
				contentHtml: true,
				defaultMarks: true,
			},
		});

		if (!question) {
			throw new AppError(404, "Question not found");
		}

		const existing = await tx.assessmentQuestion.findFirst({
			where: {
				assessmentId,
				questionId: question.id,
			},
			select: {
				id: true,
			},
		});

		if (existing) {
			throw new AppError(
				409,
				"Question is already attached to this assessment",
			);
		}

		let sortOrder = input.sortOrder;

		if (sortOrder === undefined) {
			const aggregate = await tx.assessmentQuestion.aggregate({
				where: {
					assessmentId,
				},
				_max: {
					sortOrder: true,
				},
			});

			sortOrder = (aggregate._max.sortOrder ?? 0) + 1;
		} else {
			const orderExists = await tx.assessmentQuestion.findFirst({
				where: {
					assessmentId,
					sortOrder,
				},
				select: {
					id: true,
				},
			});

			if (orderExists) {
				throw new AppError(
					409,
					"Assessment question sort order is already in use",
				);
			}
		}

		const assessmentQuestion = await tx.assessmentQuestion.create({
			data: {
				assessment: {
					connect: {
						id: assessmentId,
					},
				},
				question: {
					connect: {
						id: question.id,
					},
				},
				marks: input.marks,
				sortOrder,
			},
			include: {
				question: {
					select: {
						id: true,
						type: true,
						contentHtml: true,
						difficulty: true,
						defaultMarks: true,
					},
				},
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_QUESTION_ADDED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT_QUESTION,
				entityId: assessmentQuestion.id,
				metadata: {
					assessmentId,
					questionId: question.id,
					marks: input.marks,
					sortOrder,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return assessmentQuestion;
	});
};

const updateQuestion = async (
	userId: string,
	assessmentId: string,
	assessmentQuestionId: string,
	input: UpdateAssessmentQuestionInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const existing = await tx.assessmentQuestion.findFirst({
			where: {
				id: assessmentQuestionId,
				assessmentId,
			},
			select: {
				id: true,
			},
		});

		if (!existing) {
			throw new AppError(404, "Assessment question not found");
		}

		const updated = await tx.assessmentQuestion.update({
			where: {
				id: assessmentQuestionId,
			},
			data: {
				marks: input.marks,
			},
			include: {
				question: {
					select: {
						id: true,
						type: true,
						contentHtml: true,
					},
				},
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_QUESTION_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT_QUESTION,
				entityId: updated.id,
				metadata: {
					assessmentId,
					marks: input.marks,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return updated;
	});
};

const reorderQuestions = async (
	userId: string,
	assessmentId: string,
	input: ReorderAssessmentQuestionsInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const current = await tx.assessmentQuestion.findMany({
			where: {
				assessmentId,
			},
			select: {
				id: true,
				sortOrder: true,
			},
			orderBy: {
				sortOrder: "asc",
			},
		});

		if (current.length !== input.assessmentQuestionIds.length) {
			throw new AppError(
				400,
				"All assessment question IDs must be provided when reordering",
			);
		}

		const currentIds = new Set(current.map((item) => item.id));

		const invalidId = input.assessmentQuestionIds.some(
			(id) => !currentIds.has(id),
		);

		if (invalidId) {
			throw new AppError(400, "Invalid assessment question ID");
		}

		const maxSortOrder = current.reduce(
			(max, item) => Math.max(max, item.sortOrder),
			0,
		);

		const temporaryBase = maxSortOrder + current.length + 1000;

		await Promise.all(
			input.assessmentQuestionIds.map((id, index) =>
				tx.assessmentQuestion.update({
					where: {
						id,
					},
					data: {
						sortOrder: temporaryBase + index,
					},
				}),
			),
		);

		await Promise.all(
			input.assessmentQuestionIds.map((id, index) =>
				tx.assessmentQuestion.update({
					where: {
						id,
					},
					data: {
						sortOrder: index + 1,
					},
				}),
			),
		);

		const reordered = await tx.assessmentQuestion.findMany({
			where: {
				assessmentId,
			},
			orderBy: {
				sortOrder: "asc",
			},
			include: {
				question: {
					select: {
						id: true,
						type: true,
						contentHtml: true,
					},
				},
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_QUESTIONS_REORDERED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessmentId,
				metadata: {
					count: reordered.length,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return reordered;
	});
};

const removeQuestion = async (
	userId: string,
	assessmentId: string,
	assessmentQuestionId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		const assessmentQuestion = await tx.assessmentQuestion.findFirst({
			where: {
				id: assessmentQuestionId,
				assessmentId,
			},
			select: {
				id: true,
				questionId: true,
			},
		});

		if (!assessmentQuestion) {
			throw new AppError(404, "Assessment question not found");
		}

		await tx.assessmentQuestion.delete({
			where: {
				id: assessmentQuestion.id,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_QUESTION_REMOVED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT_QUESTION,
				entityId: assessmentQuestion.id,
				metadata: {
					assessmentId,
					questionId: assessmentQuestion.questionId,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return {
			id: assessmentQuestion.id,
		};
	});
};

const publish = async (
	userId: string,
	assessmentId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		if (locked.status !== AssessmentStatus.DRAFT || locked.credit_consumed_at) {
			throw new AppError(
				409,
				"Assessment is already published or is no longer publishable",
			);
		}

		const assessment = await tx.assessment.findUnique({
			where: {
				id: assessmentId,
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				durationMinutes: true,
				passPercentage: true,
				suspiciousThreshold: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				assessmentQuestions: {
					select: {
						id: true,
						marks: true,
						question: {
							select: {
								id: true,
								companyId: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		if (!assessment) {
			throw new AppError(404, "Assessment not found");
		}

		const publishReadiness = createPublishReadiness(
			assessment,
			recruiter.companyId,
		);

		if (!publishReadiness.canPublish) {
			throw new AppError(
				409,
				"Assessment is incomplete and cannot be published",
				publishReadiness.issues,
			);
		}

		const creditGrant = await consumeAssessmentCredit(
			tx,
			recruiter.recruiterId,
		);

		const now = new Date();

		const published = await tx.assessment.update({
			where: {
				id: assessmentId,
			},
			data: {
				status: AssessmentStatus.PUBLISHED,
				creditGrant: {
					connect: {
						id: creditGrant.id,
					},
				},
				creditConsumedAt: now,
				publishedAt: now,
			},
			select: {
				id: true,
				title: true,
				status: true,
				creditGrantId: true,
				creditConsumedAt: true,
				publishedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_CREDIT_CONSUMED,
				entityType: AUDIT_ENTITY_TYPES.CREDIT_GRANT,
				entityId: creditGrant.id,
				metadata: {
					assessmentId,
					remainingCredits: creditGrant.remainingCredits,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_PUBLISHED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessmentId,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return {
			assessment: published,
			credit: {
				grantId: creditGrant.id,
				source: creditGrant.source,
				remainingCredits: creditGrant.remainingCredits,
				expiresAt: creditGrant.expiresAt,
			},
		};
	});
};

const close = async (
	userId: string,
	assessmentId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		if (locked.status !== AssessmentStatus.PUBLISHED) {
			throw new AppError(409, "Only published assessments can be closed");
		}

		const assessment = await tx.assessment.update({
			where: {
				id: assessmentId,
			},
			data: {
				status: AssessmentStatus.CLOSED,
				closedAt: new Date(),
			},
			select: {
				id: true,
				status: true,
				closedAt: true,
				creditConsumedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ASSESSMENT_CLOSED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessmentId,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return assessment;
	});
};

const remove = async (
	userId: string,
	assessmentId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const locked = await lockOwnedAssessment(tx, recruiter, assessmentId);

		ensureDraft(locked);

		await tx.assessmentQuestion.deleteMany({
			where: {
				assessmentId,
			},
		});

		const assessment = await tx.assessment.update({
			where: {
				id: assessmentId,
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
				action: AUDIT_ACTIONS.ASSESSMENT_DELETED,
				entityType: AUDIT_ENTITY_TYPES.ASSESSMENT,
				entityId: assessmentId,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return assessment;
	});
};

const getPublished = async (query: PublishedAssessmentListQuery) => {
	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "publishedAt",
		sortOrder: "desc",
	});

	const now = new Date();

	const where: Prisma.AssessmentWhereInput = {
		status: AssessmentStatus.PUBLISHED,
		deletedAt: null,
		OR: [
			{
				closesAt: null,
			},
			{
				closesAt: {
					gt: now,
				},
			},
		],
		company: {
			is: {
				deletedAt: null,
			},
		},
		...(query.difficulty
			? {
					difficulty: query.difficulty,
				}
			: {}),
		...(query.search
			? {
					AND: [
						{
							OR: [
								{
									title: {
										contains: query.search,
										mode: "insensitive",
									},
								},
								{
									jobRole: {
										contains: query.search,
										mode: "insensitive",
									},
								},
								{
									company: {
										is: {
											name: {
												contains: query.search,
												mode: "insensitive",
											},
										},
									},
								},
							],
						},
					],
				}
			: {}),
	};

	const [assessments, total] = await prisma.$transaction([
		prisma.assessment.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				publishedAt: "desc",
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				descriptionHtml: true,
				skills: true,
				difficulty: true,
				durationMinutes: true,
				passPercentage: true,
				applicationDeadline: true,
				opensAt: true,
				closesAt: true,
				publishedAt: true,
				company: {
					select: {
						id: true,
						name: true,
						logoUrl: true,
						websiteUrl: true,
					},
				},
				_count: {
					select: {
						assessmentQuestions: true,
					},
				},
			},
		}),
		prisma.assessment.count({
			where,
		}),
	]);

	return {
		items: assessments.map((assessment) => ({
			...assessment,
			applicationOpen:
				!assessment.applicationDeadline ||
				assessment.applicationDeadline >= now,
		})),
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getPublishedById = async (assessmentId: string) => {
	const now = new Date();

	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			status: AssessmentStatus.PUBLISHED,
			deletedAt: null,
			OR: [
				{
					closesAt: null,
				},
				{
					closesAt: {
						gt: now,
					},
				},
			],
			company: {
				is: {
					deletedAt: null,
				},
			},
		},
		select: {
			id: true,
			title: true,
			jobRole: true,
			descriptionHtml: true,
			instructionsHtml: true,
			skills: true,
			difficulty: true,
			durationMinutes: true,
			passPercentage: true,
			applicationDeadline: true,
			opensAt: true,
			closesAt: true,
			publishedAt: true,
			company: {
				select: {
					id: true,
					name: true,
					logoUrl: true,
					websiteUrl: true,
				},
			},
			_count: {
				select: {
					assessmentQuestions: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(404, "Published assessment not found");
	}

	return {
		...assessment,
		applicationOpen:
			!assessment.applicationDeadline || assessment.applicationDeadline >= now,
	};
};

export const assessmentService = {
	create,
	createDraft,
	getAll,
	getById,
	update,
	syncDraft,
	addQuestion,
	updateQuestion,
	reorderQuestions,
	removeQuestion,
	publish,
	close,
	remove,
	getPublished,
	getPublishedById,
};
