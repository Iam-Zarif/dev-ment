import { type Job, Worker } from "bullmq";
import { config } from "../../../config/index.js";
import {
	AssessmentStatus,
	InvitationStatus,
	NotificationStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import {
	generateSecureToken,
	hashToken,
	logger,
} from "../../../shared/utils/index.js";
import { INVITATION_CONSTANTS } from "./invitation.constant.js";
import { sendInvitationEmail } from "./invitation.email.js";
import {
	INVITATION_EMAIL_QUEUE_NAME,
	type InvitationEmailJobData,
	invitationQueueConnection,
	recoverPendingInvitationEmailJobs,
} from "./invitation.queue.js";

let invitationEmailWorker: Worker<InvitationEmailJobData> | null = null;

let recoveryTimer: NodeJS.Timeout | null = null;

const failNotification = async (
	notificationLogId: string,
	message: string,
): Promise<void> => {
	await prisma.notificationLog.updateMany({
		where: {
			id: notificationLogId,
			status: NotificationStatus.PENDING,
		},
		data: {
			status: NotificationStatus.FAILED,
			failedAt: new Date(),
			errorMessage: message.slice(0, 2000),
		},
	});
};

const processInvitationEmail = async (
	job: Job<InvitationEmailJobData>,
): Promise<void> => {
	const notification = await prisma.notificationLog.findUnique({
		where: {
			id: job.data.notificationLogId,
		},
		select: {
			id: true,
			status: true,
			entityId: true,
		},
	});

	if (!notification || notification.status !== NotificationStatus.PENDING) {
		return;
	}

	const invitation = await prisma.invitation.findUnique({
		where: {
			id: job.data.invitationId,
		},
		select: {
			id: true,
			status: true,
			expiresAt: true,
			application: {
				select: {
					candidate: {
						select: {
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
							title: true,
							status: true,
							closesAt: true,
							company: {
								select: {
									name: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!invitation) {
		await failNotification(notification.id, "Invitation not found");

		return;
	}

	if (invitation.status !== InvitationStatus.PENDING) {
		await failNotification(notification.id, "Invitation is no longer pending");

		return;
	}

	const now = new Date();

	if (
		invitation.expiresAt <= now ||
		invitation.application.assessment.status !== AssessmentStatus.PUBLISHED ||
		(invitation.application.assessment.closesAt &&
			invitation.application.assessment.closesAt <= now)
	) {
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
					id: notification.id,
					status: NotificationStatus.PENDING,
				},
				data: {
					status: NotificationStatus.FAILED,
					failedAt: now,
					errorMessage: "Invitation expired before delivery",
				},
			}),
		]);

		return;
	}

	const token = generateSecureToken(INVITATION_CONSTANTS.TOKEN_BYTES);

	const tokenHash = hashToken(token);

	const updated = await prisma.invitation.updateMany({
		where: {
			id: invitation.id,
			status: InvitationStatus.PENDING,
			expiresAt: {
				gt: now,
			},
		},
		data: {
			tokenHash,
		},
	});

	if (updated.count !== 1) {
		await failNotification(
			notification.id,
			"Invitation status changed before delivery",
		);

		return;
	}

	await sendInvitationEmail({
		email: invitation.application.candidate.user.email,
		candidateName: invitation.application.candidate.user.legalName,
		assessmentTitle: invitation.application.assessment.title,
		companyName: invitation.application.assessment.company.name,
		token,
		expiresAt: invitation.expiresAt,
		assessmentClosesAt: invitation.application.assessment.closesAt,
	});

	const sentAt = new Date();

	await prisma.$transaction([
		prisma.invitation.updateMany({
			where: {
				id: invitation.id,
				status: InvitationStatus.PENDING,
				tokenHash,
			},
			data: {
				sentAt,
			},
		}),
		prisma.notificationLog.updateMany({
			where: {
				id: notification.id,
				status: NotificationStatus.PENDING,
			},
			data: {
				status: NotificationStatus.SENT,
				sentAt,
				failedAt: null,
				errorMessage: null,
			},
		}),
	]);
};

export const startInvitationEmailWorker = async (): Promise<void> => {
	if (invitationEmailWorker) {
		return;
	}

	invitationEmailWorker = new Worker<InvitationEmailJobData>(
		INVITATION_EMAIL_QUEUE_NAME,
		processInvitationEmail,
		{
			connection: invitationQueueConnection,
			concurrency: config.invitationEmail.concurrency,
			limiter: {
				max: config.invitationEmail.ratePerSecond,
				duration: 1000,
			},
		},
	);

	invitationEmailWorker.on("failed", (job, error) => {
		if (!job) {
			return;
		}

		const maxAttempts = job.opts.attempts ?? config.invitationEmail.maxAttempts;

		if (job.attemptsMade >= maxAttempts) {
			void failNotification(job.data.notificationLogId, error.message);
		}
	});

	invitationEmailWorker.on("error", (error) => {
		logger.error(
			{
				err: error,
			},
			"Invitation email worker error",
		);
	});

	await invitationEmailWorker.waitUntilReady();

	await recoverPendingInvitationEmailJobs();

	recoveryTimer = setInterval(() => {
		void recoverPendingInvitationEmailJobs().catch((error) => {
			logger.error(
				{
					err: error,
				},
				"Invitation queue recovery failed",
			);
		});
	}, INVITATION_CONSTANTS.RECOVERY_INTERVAL_MS);
};

export const stopInvitationEmailWorker = async (): Promise<void> => {
	if (recoveryTimer) {
		clearInterval(recoveryTimer);
		recoveryTimer = null;
	}

	if (invitationEmailWorker) {
		await invitationEmailWorker.close();
		invitationEmailWorker = null;
	}
};
