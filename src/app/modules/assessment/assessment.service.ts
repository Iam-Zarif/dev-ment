import type { Prisma } from "../../../generated/prisma/client.js";
import { AssessmentStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
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
	CreateAssessmentInput,
	ReorderAssessmentQuestionsInput,
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

		assertAssessmentSchedule({
			applicationDeadline: assessment.applicationDeadline,
			opensAt: assessment.opensAt,
			closesAt: assessment.closesAt,
		});

		if (assessment.assessmentQuestions.length === 0) {
			throw new AppError(
				409,
				"Assessment must contain at least one question before publishing",
			);
		}

		const invalidQuestion = assessment.assessmentQuestions.find(
			(item) =>
				item.question.deletedAt ||
				item.question.companyId !== recruiter.companyId ||
				item.marks.toNumber() <= 0,
		);

		if (invalidQuestion) {
			throw new AppError(
				409,
				"Assessment contains an invalid or unavailable question",
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

export const assessmentService = {
	create,
	getAll,
	getById,
	update,
	addQuestion,
	updateQuestion,
	reorderQuestions,
	removeQuestion,
	publish,
	close,
	remove,
};
