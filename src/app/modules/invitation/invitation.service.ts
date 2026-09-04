import type { Prisma } from "../../../generated/prisma/client.js";
import {
	ApplicationStatus,
	AssessmentStatus,
	InvitationStatus,
	NotificationStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import {
	calculatePagination,
	createPaginationMeta,
	generateSecureToken,
	hashToken,
	logger,
} from "../../../shared/utils/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import { getCandidateContext } from "../candidate/candidate.context.js";
import { getRecruiterContext } from "../recruiter/recruiter.context.js";
import { INVITATION_CONSTANTS } from "./invitation.constant.js";
import {
	enqueueInvitationEmailJobs,
	type InvitationEmailJobData,
} from "./invitation.queue.js";
import type {
	CreateInvitationInput,
	InvitationListQuery,
	InvitationTokenInput,
} from "./invitation.validation.js";

const calculateInvitationExpiry = (assessmentClosesAt: Date | null): Date => {
	const now = new Date();

	const defaultExpiry = new Date(
		now.getTime() + INVITATION_CONSTANTS.EXPIRES_IN_HOURS * 60 * 60 * 1000,
	);

	if (assessmentClosesAt && assessmentClosesAt <= now) {
		throw new AppError(409, "Assessment is no longer available");
	}

	if (assessmentClosesAt && assessmentClosesAt < defaultExpiry) {
		return assessmentClosesAt;
	}

	return defaultExpiry;
};

const createPlaceholderTokenHash = (): string => {
	return hashToken(generateSecureToken(INVITATION_CONSTANTS.TOKEN_BYTES));
};

const createNotificationDedupeKey = (
	invitationId: string,
	type: "initial" | "resend",
): string => {
	if (type === "initial") {
		return `invitation-email:${invitationId}:initial`;
	}

	return `invitation-email:${invitationId}:resend:${generateSecureToken(8)}`;
};

const enqueueJobsSafely = async (
	jobs: InvitationEmailJobData[],
	context: Record<string, unknown>,
): Promise<boolean> => {
	try {
		await enqueueInvitationEmailJobs(jobs);

		return true;
	} catch (error) {
		logger.error(
			{
				err: error,
				...context,
			},
			"Invitation email queue enqueue failed",
		);

		return false;
	}
};

const create = async (
	userId: string,
	input: CreateInvitationInput,
	ipAddress?: string,
) => {
	const result = await prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const applications = await tx.application.findMany({
			where: {
				id: {
					in: input.applicationIds,
				},
				assessment: {
					is: {
						recruiterId: recruiter.recruiterId,
						companyId: recruiter.companyId,
						deletedAt: null,
					},
				},
			},
			select: {
				id: true,
				status: true,
				invitation: {
					select: {
						id: true,
					},
				},
				candidate: {
					select: {
						user: {
							select: {
								id: true,
							},
						},
					},
				},
				assessment: {
					select: {
						id: true,
						status: true,
						closesAt: true,
					},
				},
			},
		});

		if (applications.length !== input.applicationIds.length) {
			throw new AppError(404, "One or more applications were not found");
		}

		const firstApplication = applications[0];

		if (!firstApplication) {
			throw new AppError(400, "At least one application is required");
		}

		const assessmentIds = new Set(
			applications.map((application) => application.assessment.id),
		);

		if (assessmentIds.size !== 1) {
			throw new AppError(
				409,
				"All selected candidates must belong to the same assessment",
			);
		}

		if (firstApplication.assessment.status !== AssessmentStatus.PUBLISHED) {
			throw new AppError(
				409,
				"Only published assessments can accept invitations",
			);
		}

		const invalidApplication = applications.find(
			(application) =>
				application.status !== ApplicationStatus.SHORTLISTED ||
				Boolean(application.invitation),
		);

		if (invalidApplication) {
			throw new AppError(
				409,
				"All selected candidates must be shortlisted and not already invited",
			);
		}

		const expiresAt = calculateInvitationExpiry(
			firstApplication.assessment.closesAt,
		);

		const applicationUpdate = await tx.application.updateMany({
			where: {
				id: {
					in: input.applicationIds,
				},
				status: ApplicationStatus.SHORTLISTED,
			},
			data: {
				status: ApplicationStatus.INVITED,
			},
		});

		if (applicationUpdate.count !== applications.length) {
			throw new AppError(409, "One or more application statuses changed");
		}

		const invitations = await tx.invitation.createManyAndReturn({
			data: applications.map((application) => ({
				applicationId: application.id,
				invitedByRecruiterId: recruiter.recruiterId,
				tokenHash: createPlaceholderTokenHash(),
				status: InvitationStatus.PENDING,
				expiresAt,
				sentAt: null,
			})),
			select: {
				id: true,
				applicationId: true,
				status: true,
				expiresAt: true,
				sentAt: true,
				createdAt: true,
			},
		});

		const userIdByApplicationId = new Map(
			applications.map((application) => [
				application.id,
				application.candidate.user.id,
			]),
		);

		const notificationLogs = await tx.notificationLog.createManyAndReturn({
			data: invitations.map((invitation) => {
				const candidateUserId = userIdByApplicationId.get(
					invitation.applicationId,
				);

				if (!candidateUserId) {
					throw new AppError(500, "Candidate mapping failed");
				}

				return {
					userId: candidateUserId,
					notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
					entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
					entityId: invitation.id,
					dedupeKey: createNotificationDedupeKey(invitation.id, "initial"),
					status: NotificationStatus.PENDING,
				};
			}),
			select: {
				id: true,
				entityId: true,
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.INVITATION_CREATED,
				entityType: AUDIT_ENTITY_TYPES.INVITATION,
				metadata: {
					assessmentId: firstApplication.assessment.id,
					count: invitations.length,
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
			invitations,
			notificationLogs,
		};
	});

	const jobs = result.notificationLogs.flatMap((notification) => {
		if (!notification.entityId) {
			return [];
		}

		return [
			{
				invitationId: notification.entityId,
				notificationLogId: notification.id,
			},
		];
	});

	const queueAccepted = await enqueueJobsSafely(jobs, {
		count: jobs.length,
		userId,
	});

	return {
		requested: input.applicationIds.length,
		queued: result.invitations.length,
		queueAccepted,
		invitations: result.invitations,
	};
};

const getAll = async (userId: string, query: InvitationListQuery) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const assessmentWhere: Prisma.AssessmentWhereInput = {
		companyId: recruiter.companyId,
		deletedAt: null,
		...(query.assessmentId
			? {
					id: query.assessmentId,
				}
			: {}),
	};

	const where: Prisma.InvitationWhereInput = {
		invitedByRecruiterId: recruiter.recruiterId,
		application: {
			is: {
				assessment: {
					is: assessmentWhere,
				},
			},
		},
		...(query.status
			? {
					status: query.status,
				}
			: {}),
	};

	const [invitations, total] = await prisma.$transaction([
		prisma.invitation.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				status: true,
				expiresAt: true,
				sentAt: true,
				acceptedAt: true,
				revokedAt: true,
				createdAt: true,
				application: {
					select: {
						id: true,
						status: true,
						candidate: {
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
						assessment: {
							select: {
								id: true,
								title: true,
								jobRole: true,
								status: true,
							},
						},
					},
				},
			},
		}),
		prisma.invitation.count({
			where,
		}),
	]);

	const invitationIds = invitations.map((invitation) => invitation.id);

	const notificationLogs =
		invitationIds.length === 0
			? []
			: await prisma.notificationLog.findMany({
					where: {
						notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
						entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
						entityId: {
							in: invitationIds,
						},
					},
					orderBy: {
						createdAt: "desc",
					},
					select: {
						entityId: true,
						status: true,
						sentAt: true,
						failedAt: true,
						errorMessage: true,
						createdAt: true,
					},
				});

	const latestDeliveryByInvitation = new Map<
		string,
		(typeof notificationLogs)[number]
	>();

	for (const log of notificationLogs) {
		if (!log.entityId) {
			continue;
		}

		if (!latestDeliveryByInvitation.has(log.entityId)) {
			latestDeliveryByInvitation.set(log.entityId, log);
		}
	}

	return {
		items: invitations.map((invitation) => {
			const delivery = latestDeliveryByInvitation.get(invitation.id);

			return {
				...invitation,
				emailDelivery: delivery
					? {
							status: delivery.status,
							sentAt: delivery.sentAt,
							failedAt: delivery.failedAt,
							errorMessage: delivery.errorMessage,
						}
					: null,
			};
		}),
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const resend = async (
	userId: string,
	invitationId: string,
	ipAddress?: string,
) => {
	const result = await prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const existing = await tx.invitation.findFirst({
			where: {
				id: invitationId,
				invitedByRecruiterId: recruiter.recruiterId,
				application: {
					is: {
						assessment: {
							is: {
								companyId: recruiter.companyId,
								deletedAt: null,
							},
						},
					},
				},
			},
			select: {
				id: true,
				status: true,
				application: {
					select: {
						id: true,
						status: true,
						candidate: {
							select: {
								user: {
									select: {
										id: true,
									},
								},
							},
						},
						assessment: {
							select: {
								id: true,
								status: true,
								closesAt: true,
							},
						},
					},
				},
			},
		});

		if (!existing) {
			throw new AppError(404, "Invitation not found");
		}

		if (existing.status === InvitationStatus.ACCEPTED) {
			throw new AppError(409, "Accepted invitation cannot be resent");
		}

		if (
			existing.application.status !== ApplicationStatus.SHORTLISTED &&
			existing.application.status !== ApplicationStatus.INVITED
		) {
			throw new AppError(409, "Invitation can no longer be sent");
		}

		if (existing.application.assessment.status !== AssessmentStatus.PUBLISHED) {
			throw new AppError(409, "Invitation can no longer be sent");
		}

		const expiresAt = calculateInvitationExpiry(
			existing.application.assessment.closesAt,
		);

		const now = new Date();

		const invitationUpdate = await tx.invitation.updateMany({
			where: {
				id: existing.id,
				status: {
					in: [
						InvitationStatus.PENDING,
						InvitationStatus.REVOKED,
						InvitationStatus.EXPIRED,
					],
				},
			},
			data: {
				tokenHash: createPlaceholderTokenHash(),
				status: InvitationStatus.PENDING,
				expiresAt,
				sentAt: null,
				acceptedAt: null,
				revokedAt: null,
			},
		});

		if (invitationUpdate.count !== 1) {
			throw new AppError(409, "Invitation status has already changed");
		}

		const applicationUpdate = await tx.application.updateMany({
			where: {
				id: existing.application.id,
				status: {
					in: [ApplicationStatus.SHORTLISTED, ApplicationStatus.INVITED],
				},
			},
			data: {
				status: ApplicationStatus.INVITED,
			},
		});

		if (applicationUpdate.count !== 1) {
			throw new AppError(409, "Application status has already changed");
		}

		await tx.notificationLog.updateMany({
			where: {
				notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
				entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
				entityId: existing.id,
				status: NotificationStatus.PENDING,
			},
			data: {
				status: NotificationStatus.FAILED,
				failedAt: now,
				errorMessage: "Superseded by invitation resend",
			},
		});

		const notificationLog = await tx.notificationLog.create({
			data: {
				userId: existing.application.candidate.user.id,
				notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
				entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
				entityId: existing.id,
				dedupeKey: createNotificationDedupeKey(existing.id, "resend"),
				status: NotificationStatus.PENDING,
			},
			select: {
				id: true,
				entityId: true,
			},
		});

		const invitation = await tx.invitation.findUnique({
			where: {
				id: existing.id,
			},
			select: {
				id: true,
				applicationId: true,
				status: true,
				expiresAt: true,
				sentAt: true,
			},
		});

		if (!invitation) {
			throw new AppError(404, "Invitation not found");
		}

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.INVITATION_RESENT,
				entityType: AUDIT_ENTITY_TYPES.INVITATION,
				entityId: invitation.id,
				metadata: {
					applicationId: existing.application.id,
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
			invitation,
			notificationLog,
		};
	});

	const queueAccepted = result.notificationLog.entityId
		? await enqueueJobsSafely(
				[
					{
						invitationId: result.notificationLog.entityId,
						notificationLogId: result.notificationLog.id,
					},
				],
				{
					invitationId: result.invitation.id,
					userId,
				},
			)
		: false;

	return {
		invitation: result.invitation,
		queueAccepted,
	};
};

const revoke = async (
	userId: string,
	invitationId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const invitation = await tx.invitation.findFirst({
			where: {
				id: invitationId,
				invitedByRecruiterId: recruiter.recruiterId,
				application: {
					is: {
						assessment: {
							is: {
								companyId: recruiter.companyId,
								deletedAt: null,
							},
						},
					},
				},
			},
			select: {
				id: true,
				status: true,
				applicationId: true,
			},
		});

		if (!invitation) {
			throw new AppError(404, "Invitation not found");
		}

		if (invitation.status !== InvitationStatus.PENDING) {
			throw new AppError(409, "Only pending invitations can be revoked");
		}

		const now = new Date();

		const revoked = await tx.invitation.updateMany({
			where: {
				id: invitation.id,
				status: InvitationStatus.PENDING,
			},
			data: {
				tokenHash: createPlaceholderTokenHash(),
				status: InvitationStatus.REVOKED,
				revokedAt: now,
			},
		});

		if (revoked.count !== 1) {
			throw new AppError(409, "Invitation status has already changed");
		}

		await tx.application.updateMany({
			where: {
				id: invitation.applicationId,
				status: ApplicationStatus.INVITED,
			},
			data: {
				status: ApplicationStatus.SHORTLISTED,
			},
		});

		await tx.notificationLog.updateMany({
			where: {
				notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
				entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
				entityId: invitation.id,
				status: NotificationStatus.PENDING,
			},
			data: {
				status: NotificationStatus.FAILED,
				failedAt: now,
				errorMessage: "Invitation revoked before delivery",
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.INVITATION_REVOKED,
				entityType: AUDIT_ENTITY_TYPES.INVITATION,
				entityId: invitation.id,
				metadata: {
					applicationId: invitation.applicationId,
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
			id: invitation.id,
			status: InvitationStatus.REVOKED,
		};
	});
};

const getCandidateInvitation = async (userId: string, token: string) => {
	const candidate = await getCandidateContext(userId);

	const tokenHash = hashToken(token);

	const invitation = await prisma.invitation.findUnique({
		where: {
			tokenHash,
		},
		select: {
			id: true,
			status: true,
			expiresAt: true,
			sentAt: true,
			acceptedAt: true,
			application: {
				select: {
					id: true,
					status: true,
					candidateId: true,
					assessment: {
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
							opensAt: true,
							closesAt: true,
							company: {
								select: {
									id: true,
									name: true,
									logoUrl: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!invitation) {
		throw new AppError(404, "Invitation not found");
	}

	if (invitation.application.candidateId !== candidate.candidateId) {
		throw new AppError(403, "This invitation does not belong to your account");
	}

	if (invitation.status === InvitationStatus.REVOKED) {
		throw new AppError(409, "Invitation has been revoked");
	}

	if (invitation.status === InvitationStatus.EXPIRED) {
		throw new AppError(410, "Invitation has expired");
	}

	if (invitation.status === InvitationStatus.PENDING) {
		const now = new Date();

		const unavailable =
			invitation.expiresAt <= now ||
			invitation.application.assessment.status !== AssessmentStatus.PUBLISHED ||
			Boolean(
				invitation.application.assessment.closesAt &&
					invitation.application.assessment.closesAt <= now,
			);

		if (unavailable) {
			await prisma.$transaction([
				prisma.invitation.updateMany({
					where: {
						id: invitation.id,
						status: InvitationStatus.PENDING,
					},
					data: {
						status: InvitationStatus.EXPIRED,
					},
				}),
				prisma.notificationLog.updateMany({
					where: {
						notificationType: INVITATION_CONSTANTS.NOTIFICATION_TYPE,
						entityType: INVITATION_CONSTANTS.NOTIFICATION_ENTITY_TYPE,
						entityId: invitation.id,
						status: NotificationStatus.PENDING,
					},
					data: {
						status: NotificationStatus.FAILED,
						failedAt: now,
						errorMessage: "Invitation expired",
					},
				}),
			]);

			throw new AppError(410, "Invitation has expired");
		}
	}

	return invitation;
};

const verify = async (userId: string, input: InvitationTokenInput) => {
	const invitation = await getCandidateInvitation(userId, input.token);

	return {
		id: invitation.id,
		status: invitation.status,
		expiresAt: invitation.expiresAt,
		sentAt: invitation.sentAt,
		acceptedAt: invitation.acceptedAt,
		applicationId: invitation.application.id,
		assessment: invitation.application.assessment,
	};
};

const accept = async (
	userId: string,
	input: InvitationTokenInput,
	ipAddress?: string,
) => {
	const tokenHash = hashToken(input.token);

	return prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const invitation = await tx.invitation.findUnique({
			where: {
				tokenHash,
			},
			select: {
				id: true,
				status: true,
				expiresAt: true,
				application: {
					select: {
						id: true,
						status: true,
						candidateId: true,
						assessment: {
							select: {
								id: true,
								status: true,
								closesAt: true,
							},
						},
					},
				},
			},
		});

		if (!invitation) {
			throw new AppError(404, "Invitation not found");
		}

		if (invitation.application.candidateId !== candidate.candidateId) {
			throw new AppError(
				403,
				"This invitation does not belong to your account",
			);
		}

		if (invitation.status === InvitationStatus.ACCEPTED) {
			throw new AppError(409, "Invitation has already been accepted");
		}

		if (invitation.status === InvitationStatus.REVOKED) {
			throw new AppError(409, "Invitation has been revoked");
		}

		if (invitation.status === InvitationStatus.EXPIRED) {
			throw new AppError(410, "Invitation has expired");
		}

		if (invitation.application.status !== ApplicationStatus.INVITED) {
			throw new AppError(409, "Application is not currently invited");
		}

		const now = new Date();

		if (
			invitation.expiresAt <= now ||
			invitation.application.assessment.status !== AssessmentStatus.PUBLISHED ||
			(invitation.application.assessment.closesAt &&
				invitation.application.assessment.closesAt <= now)
		) {
			throw new AppError(410, "Invitation has expired");
		}

		const accepted = await tx.invitation.updateMany({
			where: {
				id: invitation.id,
				status: InvitationStatus.PENDING,
				expiresAt: {
					gt: now,
				},
			},
			data: {
				status: InvitationStatus.ACCEPTED,
				acceptedAt: now,
			},
		});

		if (accepted.count !== 1) {
			throw new AppError(409, "Invitation status has already changed");
		}

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
				entityType: AUDIT_ENTITY_TYPES.INVITATION,
				entityId: invitation.id,
				metadata: {
					applicationId: invitation.application.id,
					assessmentId: invitation.application.assessment.id,
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
			id: invitation.id,
			status: InvitationStatus.ACCEPTED,
			acceptedAt: now,
			applicationId: invitation.application.id,
			assessmentId: invitation.application.assessment.id,
		};
	});
};

export const invitationService = {
	create,
	getAll,
	resend,
	revoke,
	verify,
	accept,
};
