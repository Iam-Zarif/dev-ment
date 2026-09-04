import type { Prisma } from "../../../generated/prisma/client.js";
import {
	ApplicationStatus,
	AssessmentStatus,
	AttemptStatus,
	InvitationStatus,
	McqSelectionMode,
	ProctorEventType,
	QuestionType,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import { getCandidateContext } from "../candidate/candidate.context.js";
import { ATTEMPT_CONSTANTS } from "./attempt.constant.js";
import { presentAttemptSession } from "./attempt.presenter.js";
import type {
	ProctorEventInput,
	SaveAnswerInput,
	StartAttemptInput,
} from "./attempt.validation.js";

type LockedInvitationRow = {
	id: string;
	status: InvitationStatus;
	candidateId: string;
	assessmentId: string;
	applicationStatus: ApplicationStatus;
};

type LockedAttemptRow = {
	id: string;
	status: AttemptStatus;
	expiresAt: Date;
	isSuspicious: boolean;
	assessmentId: string;
	assessmentStatus: AssessmentStatus;
	suspiciousThreshold: number;
};

const lockOwnedInvitation = async (
	tx: Prisma.TransactionClient,
	candidateId: string,
	invitationId: string,
): Promise<LockedInvitationRow> => {
	const [invitation] = await tx.$queryRaw<LockedInvitationRow[]>`
		SELECT
			i."id" AS "id",
			i."status" AS "status",
			a."candidate_id" AS "candidateId",
			a."assessment_id" AS "assessmentId",
			a."status" AS "applicationStatus"
		FROM "invitations" i
		INNER JOIN "applications" a
			ON a."id" = i."application_id"
		WHERE
			i."id" = ${invitationId}::uuid
			AND a."candidate_id" = ${candidateId}::uuid
		FOR UPDATE OF i
	`;

	if (!invitation) {
		throw new AppError(404, "Invitation not found");
	}

	return invitation;
};

const lockOwnedAttempt = async (
	tx: Prisma.TransactionClient,
	candidateId: string,
	attemptId: string,
): Promise<LockedAttemptRow> => {
	const [attempt] = await tx.$queryRaw<LockedAttemptRow[]>`
		SELECT
			a."id" AS "id",
			a."status" AS "status",
			a."expires_at" AS "expiresAt",
			a."is_suspicious" AS "isSuspicious",
			ap."assessment_id" AS "assessmentId",
			ass."status" AS "assessmentStatus",
			ass."suspicious_threshold" AS "suspiciousThreshold"
		FROM "attempts" a
		INNER JOIN "invitations" i
			ON i."id" = a."invitation_id"
		INNER JOIN "applications" ap
			ON ap."id" = i."application_id"
		INNER JOIN "assessments" ass
			ON ass."id" = ap."assessment_id"
		WHERE
			a."id" = ${attemptId}::uuid
			AND ap."candidate_id" = ${candidateId}::uuid
		FOR UPDATE OF a
	`;

	if (!attempt) {
		throw new AppError(404, "Attempt not found");
	}

	return attempt;
};

const isAttemptUnavailable = (
	attempt: LockedAttemptRow,
	now: Date,
): boolean => {
	return (
		attempt.expiresAt <= now ||
		attempt.assessmentStatus !== AssessmentStatus.PUBLISHED
	);
};

const autoSubmitLockedAttempt = async (
	tx: Prisma.TransactionClient,
	attemptId: string,
	now: Date,
	actorUserId?: string,
	ipAddress?: string,
) => {
	const attempt = await tx.attempt.update({
		where: {
			id: attemptId,
		},
		data: {
			status: AttemptStatus.AUTO_SUBMITTED,
			submittedAt: now,
		},
		select: {
			id: true,
			status: true,
			submittedAt: true,
		},
	});

	await auditService.create(
		{
			...(actorUserId ? { actorUserId } : {}),
			action: AUDIT_ACTIONS.ATTEMPT_AUTO_SUBMITTED,
			entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
			entityId: attempt.id,
			...(ipAddress ? { ipAddress } : {}),
		},
		tx,
	);

	return attempt;
};

const loadAttemptSession = async (candidateId: string, attemptId: string) => {
	const session = await prisma.attempt.findFirst({
		where: {
			id: attemptId,
			invitation: {
				is: {
					application: {
						is: {
							candidateId,
						},
					},
				},
			},
		},
		select: {
			id: true,
			status: true,
			startedAt: true,
			expiresAt: true,
			submittedAt: true,
			isSuspicious: true,
			tabSwitchCount: true,
			invitation: {
				select: {
					id: true,
					application: {
						select: {
							id: true,
							assessment: {
								select: {
									id: true,
									title: true,
									jobRole: true,
									instructionsHtml: true,
									durationMinutes: true,
									opensAt: true,
									closesAt: true,
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
													id: true,
													type: true,
													contentHtml: true,
													difficulty: true,
													selectionMode: true,
													allowedLanguages: true,
													starterCode: true,
													timeLimitMs: true,
													memoryLimitKb: true,
													options: {
														orderBy: {
															sortOrder: "asc",
														},
														select: {
															id: true,
															optionHtml: true,
															sortOrder: true,
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
			answers: {
				orderBy: {
					createdAt: "asc",
				},
				select: {
					id: true,
					assessmentQuestionId: true,
					answerText: true,
					codeAnswer: true,
					language: true,
					lastSavedAt: true,
					selectedOptions: {
						select: {
							optionId: true,
						},
					},
				},
			},
		},
	});

	if (!session) {
		throw new AppError(404, "Attempt not found");
	}

	return session;
};

const settleAttemptIfUnavailable = async (
	userId: string,
	candidateId: string,
	attemptId: string,
	ipAddress?: string,
): Promise<void> => {
	await prisma.$transaction(async (tx) => {
		const attempt = await lockOwnedAttempt(tx, candidateId, attemptId);

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			return;
		}

		const now = new Date();

		if (!isAttemptUnavailable(attempt, now)) {
			return;
		}

		await autoSubmitLockedAttempt(tx, attempt.id, now, userId, ipAddress);
	});
};

const start = async (
	userId: string,
	input: StartAttemptInput,
	ipAddress?: string,
) => {
	const attempt = await prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const lockedInvitation = await lockOwnedInvitation(
			tx,
			candidate.candidateId,
			input.invitationId,
		);

		if (lockedInvitation.status !== InvitationStatus.ACCEPTED) {
			throw new AppError(
				409,
				"Invitation must be accepted before starting the assessment",
			);
		}

		if (lockedInvitation.applicationStatus !== ApplicationStatus.INVITED) {
			throw new AppError(409, "Application is not currently invited");
		}

		const existingAttempt = await tx.attempt.findUnique({
			where: {
				invitationId: lockedInvitation.id,
			},
			select: {
				id: true,
				status: true,
			},
		});

		if (existingAttempt) {
			throw new AppError(409, "An attempt already exists for this invitation");
		}

		const assessment = await tx.assessment.findFirst({
			where: {
				id: lockedInvitation.assessmentId,
				deletedAt: null,
			},
			select: {
				id: true,
				status: true,
				opensAt: true,
				closesAt: true,
				durationMinutes: true,
				_count: {
					select: {
						assessmentQuestions: true,
					},
				},
			},
		});

		if (!assessment) {
			throw new AppError(404, "Assessment not found");
		}

		if (assessment.status !== AssessmentStatus.PUBLISHED) {
			throw new AppError(409, "Assessment is not currently available");
		}

		if (assessment._count.assessmentQuestions === 0) {
			throw new AppError(409, "Assessment has no questions");
		}

		const now = new Date();

		if (assessment.opensAt && assessment.opensAt > now) {
			throw new AppError(409, "Assessment has not opened yet");
		}

		if (assessment.closesAt && assessment.closesAt <= now) {
			throw new AppError(410, "Assessment has already closed");
		}

		const durationEnd = new Date(
			now.getTime() + assessment.durationMinutes * 60 * 1000,
		);

		const expiresAt =
			assessment.closesAt && assessment.closesAt < durationEnd
				? assessment.closesAt
				: durationEnd;

		const created = await tx.attempt.create({
			data: {
				invitationId: lockedInvitation.id,
				status: AttemptStatus.IN_PROGRESS,
				startedAt: now,
				expiresAt,
			},
			select: {
				id: true,
				status: true,
				startedAt: true,
				expiresAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ATTEMPT_STARTED,
				entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
				entityId: created.id,
				metadata: {
					invitationId: lockedInvitation.id,
					assessmentId: assessment.id,
				},
				...(ipAddress ? { ipAddress } : {}),
			},
			tx,
		);

		return created;
	});

	return getById(userId, attempt.id, ipAddress);
};

const getById = async (
	userId: string,
	attemptId: string,
	ipAddress?: string,
) => {
	const candidate = await getCandidateContext(userId);

	await settleAttemptIfUnavailable(
		userId,
		candidate.candidateId,
		attemptId,
		ipAddress,
	);

	const session = await loadAttemptSession(candidate.candidateId, attemptId);

	return presentAttemptSession(session, new Date());
};

const saveAnswer = async (
	userId: string,
	attemptId: string,
	assessmentQuestionId: string,
	input: SaveAnswerInput,
	ipAddress?: string,
) => {
	const result = await prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const attempt = await lockOwnedAttempt(
			tx,
			candidate.candidateId,
			attemptId,
		);

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new AppError(409, "Attempt is no longer in progress");
		}

		const now = new Date();

		if (isAttemptUnavailable(attempt, now)) {
			await autoSubmitLockedAttempt(tx, attempt.id, now, userId, ipAddress);

			return {
				expired: true as const,
			};
		}

		const assessmentQuestion = await tx.assessmentQuestion.findFirst({
			where: {
				id: assessmentQuestionId,
				assessmentId: attempt.assessmentId,
			},
			select: {
				id: true,
				question: {
					select: {
						id: true,
						type: true,
						selectionMode: true,
						allowedLanguages: true,
						options: {
							select: {
								id: true,
							},
						},
					},
				},
			},
		});

		if (!assessmentQuestion) {
			throw new AppError(404, "Assessment question not found");
		}

		const question = assessmentQuestion.question;

		if (question.type === QuestionType.MCQ) {
			if (!("selectedOptionIds" in input)) {
				throw new AppError(400, "MCQ answer format is invalid");
			}

			if (
				question.selectionMode === McqSelectionMode.SINGLE &&
				input.selectedOptionIds.length > 1
			) {
				throw new AppError(
					400,
					"SINGLE MCQ allows at most one selected option",
				);
			}

			const validOptionIds = new Set(
				question.options.map((option) => option.id),
			);

			if (
				input.selectedOptionIds.some(
					(optionId) => !validOptionIds.has(optionId),
				)
			) {
				throw new AppError(
					400,
					"One or more selected options do not belong to this question",
				);
			}
		} else if (
			question.type === QuestionType.SHORT_TEXT ||
			question.type === QuestionType.LONG_TEXT
		) {
			if (!("answerText" in input)) {
				throw new AppError(400, "Text answer format is invalid");
			}
		} else if (question.type === QuestionType.CODING) {
			if (!("codeAnswer" in input && "language" in input)) {
				throw new AppError(400, "Coding answer format is invalid");
			}

			const allowedLanguages = question.allowedLanguages.map((language) =>
				language.toLowerCase(),
			);

			if (!allowedLanguages.includes(input.language)) {
				throw new AppError(
					400,
					"Selected programming language is not allowed for this question",
				);
			}
		}

		const answer = await tx.answer.upsert({
			where: {
				attemptId_assessmentQuestionId: {
					attemptId: attempt.id,
					assessmentQuestionId,
				},
			},
			create: {
				attemptId: attempt.id,
				assessmentQuestionId,
				answerText: "answerText" in input ? input.answerText : null,
				codeAnswer: "codeAnswer" in input ? input.codeAnswer : null,
				language: "language" in input ? input.language : null,
				lastSavedAt: now,
			},
			update: {
				answerText: "answerText" in input ? input.answerText : null,
				codeAnswer: "codeAnswer" in input ? input.codeAnswer : null,
				language: "language" in input ? input.language : null,
				lastSavedAt: now,
			},
			select: {
				id: true,
				assessmentQuestionId: true,
				answerText: true,
				codeAnswer: true,
				language: true,
				lastSavedAt: true,
			},
		});

		await tx.answerSelectedOption.deleteMany({
			where: {
				answerId: answer.id,
			},
		});

		if ("selectedOptionIds" in input && input.selectedOptionIds.length > 0) {
			await tx.answerSelectedOption.createMany({
				data: input.selectedOptionIds.map((optionId) => ({
					answerId: answer.id,
					optionId,
				})),
			});
		}

		return {
			expired: false as const,
			answer: {
				...answer,
				selectedOptionIds:
					"selectedOptionIds" in input ? input.selectedOptionIds : [],
			},
		};
	});

	if (result.expired) {
		throw new AppError(410, "Attempt time has expired");
	}

	return result.answer;
};

const recordProctorEvent = async (
	userId: string,
	attemptId: string,
	input: ProctorEventInput,
	ipAddress?: string,
) => {
	const metadataSize = Buffer.byteLength(
		JSON.stringify(input.metadata ?? {}),
		"utf8",
	);

	if (metadataSize > ATTEMPT_CONSTANTS.MAX_PROCTOR_METADATA_BYTES) {
		throw new AppError(400, "Proctor event metadata is too large");
	}

	const result = await prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const attempt = await lockOwnedAttempt(
			tx,
			candidate.candidateId,
			attemptId,
		);

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new AppError(409, "Attempt is no longer in progress");
		}

		const now = new Date();

		if (isAttemptUnavailable(attempt, now)) {
			await autoSubmitLockedAttempt(tx, attempt.id, now, userId, ipAddress);

			return {
				expired: true as const,
			};
		}

		const event = await tx.proctorEvent.upsert({
			where: {
				attemptId_clientEventId: {
					attemptId: attempt.id,
					clientEventId: input.clientEventId,
				},
			},
			create: {
				attemptId: attempt.id,
				clientEventId: input.clientEventId,
				eventType: input.eventType,
				occurredAt: input.occurredAt,
				...(input.metadata !== undefined
					? {
							metadata: input.metadata as Prisma.InputJsonValue,
						}
					: {}),
			},
			update: {},
			select: {
				id: true,
				clientEventId: true,
				eventType: true,
				occurredAt: true,
				createdAt: true,
			},
		});

		const [totalProctorEvents, tabSwitchCount] = await Promise.all([
			tx.proctorEvent.count({
				where: {
					attemptId: attempt.id,
				},
			}),
			tx.proctorEvent.count({
				where: {
					attemptId: attempt.id,
					eventType: ProctorEventType.TAB_HIDDEN,
				},
			}),
		]);

		const isSuspicious = totalProctorEvents >= attempt.suspiciousThreshold;

		await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				tabSwitchCount,
				isSuspicious,
			},
		});

		if (!attempt.isSuspicious && isSuspicious) {
			await auditService.create(
				{
					actorUserId: userId,
					action: AUDIT_ACTIONS.ATTEMPT_FLAGGED_SUSPICIOUS,
					entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
					entityId: attempt.id,
					metadata: {
						totalProctorEvents,
						suspiciousThreshold: attempt.suspiciousThreshold,
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
			expired: false as const,
			event,
			totalProctorEvents,
			tabSwitchCount,
			isSuspicious,
		};
	});

	if (result.expired) {
		throw new AppError(410, "Attempt time has expired");
	}

	return {
		event: result.event,
		totalProctorEvents: result.totalProctorEvents,
		tabSwitchCount: result.tabSwitchCount,
		isSuspicious: result.isSuspicious,
	};
};

const submit = async (
	userId: string,
	attemptId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const attempt = await lockOwnedAttempt(
			tx,
			candidate.candidateId,
			attemptId,
		);

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new AppError(409, "Attempt has already been submitted");
		}

		const now = new Date();

		if (isAttemptUnavailable(attempt, now)) {
			return autoSubmitLockedAttempt(tx, attempt.id, now, userId, ipAddress);
		}

		const submitted = await tx.attempt.update({
			where: {
				id: attempt.id,
			},
			data: {
				status: AttemptStatus.SUBMITTED,
				submittedAt: now,
			},
			select: {
				id: true,
				status: true,
				submittedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.ATTEMPT_SUBMITTED,
				entityType: AUDIT_ENTITY_TYPES.ATTEMPT,
				entityId: submitted.id,
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return submitted;
	});
};

export const attemptService = {
	start,
	getById,
	saveAnswer,
	recordProctorEvent,
	submit,
};
