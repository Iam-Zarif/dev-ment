import type { Prisma } from "../../../generated/prisma/client.js";
import {
	AttemptStatus,
	EvaluationStatus,
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
import { getCandidateContext } from "../candidate/candidate.context.js";
import {
	getRecruiterContext,
	type RecruiterContext,
} from "../recruiter/recruiter.context.js";
import type {
	EvaluationListQuery,
	FinalizeEvaluationInput,
	ManualEvaluationInput,
} from "./evaluation.validation.js";

type LockedEvaluationAttempt = {
	id: string;
	status: AttemptStatus;
	evaluationStatus: EvaluationStatus;
	assessmentId: string;
};

const ensureSubmitted = (attempt: LockedEvaluationAttempt) => {
	if (
		attempt.status !== AttemptStatus.SUBMITTED &&
		attempt.status !== AttemptStatus.AUTO_SUBMITTED
	) {
		throw new AppError(409, "Only submitted attempts can be evaluated");
	}
};

const lockOwnedAttempt = async (
	tx: Prisma.TransactionClient,
	recruiter: RecruiterContext,
	attemptId: string,
): Promise<LockedEvaluationAttempt> => {
	const [attempt] = await tx.$queryRaw<LockedEvaluationAttempt[]>`
			SELECT
				at."id" AS "id",
				at."status" AS "status",
				at."evaluation_status" AS "evaluationStatus",
				app."assessment_id" AS "assessmentId"
			FROM "attempts" at
			INNER JOIN "invitations" i
				ON i."id" = at."invitation_id"
			INNER JOIN "applications" app
				ON app."id" = i."application_id"
			INNER JOIN "assessments" ass
				ON ass."id" = app."assessment_id"
			WHERE
				at."id" = ${attemptId}::uuid
				AND ass."recruiter_id" = ${recruiter.recruiterId}::uuid
				AND ass."company_id" = ${recruiter.companyId}::uuid
				AND ass."deleted_at" IS NULL
			FOR UPDATE OF at
		`;

	if (!attempt) {
		throw new AppError(404, "Attempt not found");
	}

	return attempt;
};

const getAll = async (userId: string, query: EvaluationListQuery) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "submittedAt",
		sortOrder: "desc",
	});

	const where: Prisma.AttemptWhereInput = {
		status: {
			in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED],
		},
		invitation: {
			is: {
				application: {
					is: {
						assessment: {
							is: {
								recruiterId: recruiter.recruiterId,
								companyId: recruiter.companyId,
								deletedAt: null,
								...(query.assessmentId
									? {
											id: query.assessmentId,
										}
									: {}),
							},
						},
					},
				},
			},
		},
		...(query.status
			? {
					evaluationStatus: query.status,
				}
			: {}),
		...(query.isSuspicious !== undefined
			? {
					isSuspicious: query.isSuspicious,
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
							invitation: {
								is: {
									application: {
										is: {
											candidate: {
												is: {
													user: {
														is: {
															legalName: {
																contains: query.search,
																mode: "insensitive",
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
						{
							invitation: {
								is: {
									application: {
										is: {
											candidate: {
												is: {
													user: {
														is: {
															email: {
																contains: query.search,
																mode: "insensitive",
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					],
				}
			: {}),
	};

	const [attempts, total] = await prisma.$transaction([
		prisma.attempt.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				submittedAt: "desc",
			},
			select: {
				id: true,
				status: true,
				evaluationStatus: true,
				totalScore: true,
				percentage: true,
				passed: true,
				isSuspicious: true,
				tabSwitchCount: true,
				startedAt: true,
				expiresAt: true,
				submittedAt: true,
				finalizedAt: true,
				resultReleasedAt: true,
				invitation: {
					select: {
						application: {
							select: {
								candidate: {
									select: {
										id: true,
										headline: true,
										user: {
											select: {
												id: true,
												legalName: true,
												email: true,
												imageUrl: true,
											},
										},
									},
								},
								assessment: {
									select: {
										id: true,
										title: true,
										jobRole: true,
									},
								},
							},
						},
					},
				},
			},
		}),
		prisma.attempt.count({
			where,
		}),
	]);

	return {
		items: attempts,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getById = async (userId: string, attemptId: string) => {
	const recruiter = await getRecruiterContext(userId);

	const attempt = await prisma.attempt.findFirst({
		where: {
			id: attemptId,
			status: {
				in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED],
			},
			invitation: {
				is: {
					application: {
						is: {
							assessment: {
								is: {
									recruiterId: recruiter.recruiterId,
									companyId: recruiter.companyId,
									deletedAt: null,
								},
							},
						},
					},
				},
			},
		},
		select: {
			id: true,
			status: true,
			evaluationStatus: true,
			totalScore: true,
			percentage: true,
			passed: true,
			finalFeedback: true,
			isSuspicious: true,
			tabSwitchCount: true,
			startedAt: true,
			expiresAt: true,
			submittedAt: true,
			finalizedAt: true,
			resultReleasedAt: true,
			proctorEvents: {
				orderBy: {
					occurredAt: "asc",
				},
				select: {
					id: true,
					clientEventId: true,
					eventType: true,
					occurredAt: true,
					metadata: true,
				},
			},
			invitation: {
				select: {
					application: {
						select: {
							candidate: {
								select: {
									id: true,
									phone: true,
									headline: true,
									experienceYears: true,
									skills: true,
									githubUrl: true,
									linkedinUrl: true,
									portfolioUrl: true,
									resumeUrl: true,
									user: {
										select: {
											id: true,
											legalName: true,
											email: true,
											imageUrl: true,
										},
									},
								},
							},
							assessment: {
								select: {
									id: true,
									title: true,
									jobRole: true,
									passPercentage: true,
									assessmentQuestions: {
										orderBy: {
											sortOrder: "asc",
										},
										select: {
											id: true,
											sortOrder: true,
											marks: true,
											question: {
												select: {
													id: true,
													type: true,
													contentHtml: true,
													evaluationRubric: true,
													selectionMode: true,
													allowedLanguages: true,
													options: {
														orderBy: {
															sortOrder: "asc",
														},
														select: {
															id: true,
															optionHtml: true,
															isCorrect: true,
															sortOrder: true,
														},
													},
													codingTestCases: {
														orderBy: {
															sortOrder: "asc",
														},
														select: {
															id: true,
															inputText: true,
															expectedOutput: true,
															isHidden: true,
															weight: true,
															sortOrder: true,
														},
													},
												},
											},
											answers: {
												where: {
													attemptId,
												},
												select: {
													id: true,
													answerText: true,
													codeAnswer: true,
													language: true,
													autoScore: true,
													manualScore: true,
													finalScore: true,
													recruiterFeedback: true,
													evaluatedAt: true,
													selectedOptions: {
														select: {
															optionId: true,
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(404, "Submitted attempt not found");
	}

	const assessment = attempt.invitation.application.assessment;

	return {
		...attempt,
		invitation: undefined,
		candidate: attempt.invitation.application.candidate,
		assessment: {
			id: assessment.id,
			title: assessment.title,
			jobRole: assessment.jobRole,
			passPercentage: assessment.passPercentage,
			questions: assessment.assessmentQuestions.map((item) => ({
				id: item.id,
				sortOrder: item.sortOrder,
				marks: item.marks,
				question: item.question,
				answer: item.answers[0] ?? null,
			})),
		},
	};
};

const reviewAnswer = async (
	userId: string,
	attemptId: string,
	assessmentQuestionId: string,
	input: ManualEvaluationInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const attempt = await lockOwnedAttempt(tx, recruiter, attemptId);

		ensureSubmitted(attempt);

		if (attempt.evaluationStatus === EvaluationStatus.FINALIZED) {
			throw new AppError(409, "Finalized evaluation cannot be modified");
		}

		const item = await tx.assessmentQuestion.findFirst({
			where: {
				id: assessmentQuestionId,
				assessmentId: attempt.assessmentId,
			},
			select: {
				id: true,
				marks: true,
				question: {
					select: {
						type: true,
					},
				},
			},
		});

		if (!item) {
			throw new AppError(404, "Assessment question not found");
		}

		if (item.question.type === QuestionType.MCQ) {
			throw new AppError(409, "MCQ questions are evaluated automatically");
		}

		const maxMarks = item.marks.toNumber();

		if (input.manualScore > maxMarks) {
			throw new AppError(400, `Manual score cannot exceed ${maxMarks}`);
		}

		const existing = await tx.answer.findUnique({
			where: {
				attemptId_assessmentQuestionId: {
					attemptId: attempt.id,
					assessmentQuestionId: item.id,
				},
			},
			select: {
				id: true,
				answerText: true,
				codeAnswer: true,
			},
		});

		const hasSubmittedAnswer =
			item.question.type === QuestionType.CODING
				? Boolean(existing?.codeAnswer?.trim())
				: Boolean(existing?.answerText?.trim());

		if (!hasSubmittedAnswer && input.manualScore > 0) {
			throw new AppError(
				400,
				"An unanswered question cannot receive a positive score",
			);
		}

		const now = new Date();

		const answer = await tx.answer.upsert({
			where: {
				attemptId_assessmentQuestionId: {
					attemptId: attempt.id,
					assessmentQuestionId: item.id,
				},
			},
			create: {
				attemptId: attempt.id,
				assessmentQuestionId: item.id,
				manualScore: input.manualScore,
				finalScore: input.manualScore,
				recruiterFeedback: input.recruiterFeedback ?? null,
				evaluatedByRecruiterId: recruiter.recruiterId,
				evaluatedAt: now,
			},
			update: {
				manualScore: input.manualScore,
				finalScore: input.manualScore,
				recruiterFeedback: input.recruiterFeedback ?? null,
				evaluatedByRecruiterId: recruiter.recruiterId,
				evaluatedAt: now,
			},
			select: {
				id: true,
				assessmentQuestionId: true,
				manualScore: true,
				finalScore: true,
				recruiterFeedback: true,
				evaluatedAt: true,
			},
		});

		await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				evaluationStatus: EvaluationStatus.PARTIAL,
				totalScore: null,
				percentage: null,
				passed: null,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ANSWER_MANUALLY_EVALUATED,
				entityType: AUDIT_ENTITY_TYPES.ANSWER,
				entityId: answer.id,
				metadata: {
					attemptId: attempt.id,
					assessmentQuestionId: item.id,
					score: input.manualScore,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return answer;
	});
};

const evaluate = async (
	userId: string,
	attemptId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const attempt = await lockOwnedAttempt(tx, recruiter, attemptId);

		ensureSubmitted(attempt);

		if (attempt.evaluationStatus === EvaluationStatus.FINALIZED) {
			throw new AppError(409, "Finalized evaluation cannot be recalculated");
		}

		const assessment = await tx.assessment.findUnique({
			where: {
				id: attempt.assessmentId,
			},
			select: {
				passPercentage: true,
				assessmentQuestions: {
					orderBy: {
						sortOrder: "asc",
					},
					select: {
						id: true,
						marks: true,
						question: {
							select: {
								type: true,
								options: {
									select: {
										id: true,
										isCorrect: true,
									},
								},
							},
						},
						answers: {
							where: {
								attemptId: attempt.id,
							},
							select: {
								id: true,
								answerText: true,
								codeAnswer: true,
								manualScore: true,
								selectedOptions: {
									select: {
										optionId: true,
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

		if (assessment.assessmentQuestions.length === 0) {
			throw new AppError(409, "Assessment has no questions");
		}

		const pendingManual: string[] = [];

		let totalMarks = 0;
		let totalScore = 0;

		for (const item of assessment.assessmentQuestions) {
			const marks = item.marks.toNumber();

			totalMarks += marks;

			const answer = item.answers[0] ?? null;

			if (item.question.type === QuestionType.MCQ) {
				const correctIds = item.question.options
					.filter((option) => option.isCorrect)
					.map((option) => option.id)
					.sort();

				const selectedIds = (answer?.selectedOptions ?? [])
					.map((option) => option.optionId)
					.sort();

				const isCorrect =
					correctIds.length === selectedIds.length &&
					correctIds.every((id, index) => id === selectedIds[index]);

				const score = isCorrect ? marks : 0;

				totalScore += score;

				await tx.answer.upsert({
					where: {
						attemptId_assessmentQuestionId: {
							attemptId: attempt.id,
							assessmentQuestionId: item.id,
						},
					},
					create: {
						attemptId: attempt.id,
						assessmentQuestionId: item.id,
						autoScore: score,
						finalScore: score,
						evaluatedAt: new Date(),
					},
					update: {
						autoScore: score,
						manualScore: null,
						finalScore: score,
						evaluatedByRecruiterId: null,
						evaluatedAt: new Date(),
					},
				});

				continue;
			}

			const hasAnswer =
				item.question.type === QuestionType.CODING
					? Boolean(answer?.codeAnswer?.trim())
					: Boolean(answer?.answerText?.trim());

			if (!hasAnswer) {
				await tx.answer.upsert({
					where: {
						attemptId_assessmentQuestionId: {
							attemptId: attempt.id,
							assessmentQuestionId: item.id,
						},
					},
					create: {
						attemptId: attempt.id,
						assessmentQuestionId: item.id,
						manualScore: 0,
						finalScore: 0,
						evaluatedAt: new Date(),
					},
					update: {
						manualScore: 0,
						finalScore: 0,
						evaluatedAt: new Date(),
					},
				});

				continue;
			}

			if (answer?.manualScore === null || answer?.manualScore === undefined) {
				pendingManual.push(item.id);

				continue;
			}

			const score = answer.manualScore.toNumber();

			if (score > marks) {
				throw new AppError(409, "An answer score exceeds its question marks");
			}

			totalScore += score;

			await tx.answer.update({
				where: {
					id: answer.id,
				},
				data: {
					finalScore: score,
				},
			});
		}

		if (pendingManual.length > 0) {
			throw new AppError(
				409,
				`${pendingManual.length} submitted text/coding answer(s) still require manual evaluation`,
			);
		}

		if (totalMarks <= 0) {
			throw new AppError(
				409,
				"Assessment total marks must be greater than zero",
			);
		}

		const percentage = Math.round((totalScore / totalMarks) * 10000) / 100;

		const passed = percentage >= assessment.passPercentage.toNumber();

		const evaluated = await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				evaluationStatus: EvaluationStatus.EVALUATED,
				totalScore,
				percentage,
				passed,
			},
			select: {
				id: true,
				evaluationStatus: true,
				totalScore: true,
				percentage: true,
				passed: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ATTEMPT_EVALUATED,
				entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
				entityId: attempt.id,
				metadata: {
					totalMarks,
					totalScore,
					percentage,
					passed,
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
			...evaluated,
			totalMarks,
		};
	});
};

const finalize = async (
	userId: string,
	attemptId: string,
	input: FinalizeEvaluationInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const attempt = await lockOwnedAttempt(tx, recruiter, attemptId);

		ensureSubmitted(attempt);

		if (attempt.evaluationStatus !== EvaluationStatus.EVALUATED) {
			throw new AppError(
				409,
				"Attempt must be fully evaluated before finalization",
			);
		}

		const now = new Date();

		const finalized = await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				evaluationStatus: EvaluationStatus.FINALIZED,
				finalFeedback: input.finalFeedback ?? null,
				finalizedByRecruiterId: recruiter.recruiterId,
				finalizedAt: now,
			},
			select: {
				id: true,
				evaluationStatus: true,
				totalScore: true,
				percentage: true,
				passed: true,
				finalFeedback: true,
				finalizedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ATTEMPT_EVALUATION_FINALIZED,
				entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
				entityId: attempt.id,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return finalized;
	});
};

const release = async (
	userId: string,
	attemptId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const attempt = await lockOwnedAttempt(tx, recruiter, attemptId);

		ensureSubmitted(attempt);

		if (attempt.evaluationStatus !== EvaluationStatus.FINALIZED) {
			throw new AppError(409, "Result must be finalized before release");
		}

		const current = await tx.attempt.findUnique({
			where: {
				id: attempt.id,
			},
			select: {
				resultReleasedAt: true,
			},
		});

		if (current?.resultReleasedAt) {
			throw new AppError(409, "Result has already been released");
		}

		const now = new Date();

		const released = await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				resultReleasedAt: now,
			},
			select: {
				id: true,
				evaluationStatus: true,
				totalScore: true,
				percentage: true,
				passed: true,
				resultReleasedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ATTEMPT_RESULT_RELEASED,
				entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
				entityId: attempt.id,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return released;
	});
};

const getCandidateResult = async (userId: string, attemptId: string) => {
	const candidate = await getCandidateContext(userId);

	const attempt = await prisma.attempt.findFirst({
		where: {
			id: attemptId,
			evaluationStatus: EvaluationStatus.FINALIZED,
			resultReleasedAt: {
				not: null,
			},
			invitation: {
				is: {
					application: {
						is: {
							candidateId: candidate.candidateId,
						},
					},
				},
			},
		},
		select: {
			id: true,
			status: true,
			totalScore: true,
			percentage: true,
			passed: true,
			finalFeedback: true,
			finalizedAt: true,
			resultReleasedAt: true,
			invitation: {
				select: {
					application: {
						select: {
							assessment: {
								select: {
									id: true,
									title: true,
									jobRole: true,
									passPercentage: true,
									company: {
										select: {
											id: true,
											name: true,
											logoUrl: true,
										},
									},
									assessmentQuestions: {
										orderBy: {
											sortOrder: "asc",
										},
										select: {
											id: true,
											sortOrder: true,
											marks: true,
											question: {
												select: {
													type: true,
													contentHtml: true,
												},
											},
											answers: {
												where: {
													attemptId,
												},
												select: {
													finalScore: true,
													recruiterFeedback: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(404, "Released result not found");
	}

	const assessment = attempt.invitation.application.assessment;

	const totalMarks = assessment.assessmentQuestions.reduce(
		(total, item) => total + item.marks.toNumber(),
		0,
	);

	return {
		attemptId: attempt.id,
		status: attempt.status,
		totalScore: attempt.totalScore,
		totalMarks,
		percentage: attempt.percentage,
		passed: attempt.passed,
		finalFeedback: attempt.finalFeedback,
		finalizedAt: attempt.finalizedAt,
		resultReleasedAt: attempt.resultReleasedAt,
		assessment: {
			id: assessment.id,
			title: assessment.title,
			jobRole: assessment.jobRole,
			passPercentage: assessment.passPercentage,
			company: assessment.company,
		},
		questions: assessment.assessmentQuestions.map((item) => ({
			assessmentQuestionId: item.id,
			sortOrder: item.sortOrder,
			type: item.question.type,
			contentHtml: item.question.contentHtml,
			marks: item.marks,
			score: item.answers[0]?.finalScore ?? 0,
			feedback: item.answers[0]?.recruiterFeedback ?? null,
		})),
	};
};

export const evaluationService = {
	getAll,
	getById,
	reviewAnswer,
	evaluate,
	finalize,
	release,
	getCandidateResult,
};
