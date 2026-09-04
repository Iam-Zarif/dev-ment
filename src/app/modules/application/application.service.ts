import type { Prisma } from "../../../generated/prisma/client.js";
import {
	ApplicationStatus,
	AssessmentStatus,
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
import { getRecruiterContext } from "../recruiter/recruiter.context.js";
import type {
	ApplicationListQuery,
	ApplyAssessmentInput,
	RejectApplicationInput,
} from "./application.validation.js";

const apply = async (
	userId: string,
	input: ApplyAssessmentInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const candidate = await getCandidateContext(userId, tx);

		const assessment = await tx.assessment.findFirst({
			where: {
				id: input.assessmentId,
				status: AssessmentStatus.PUBLISHED,
				deletedAt: null,
			},
			select: {
				id: true,
				title: true,
				jobRole: true,
				applicationDeadline: true,
				closesAt: true,
				company: {
					select: {
						id: true,
						name: true,
						deletedAt: true,
					},
				},
			},
		});

		if (!assessment || assessment.company.deletedAt) {
			throw new AppError(404, "Assessment is not available");
		}

		const now = new Date();

		if (
			assessment.applicationDeadline &&
			assessment.applicationDeadline < now
		) {
			throw new AppError(409, "Application deadline has passed");
		}

		if (assessment.closesAt && assessment.closesAt <= now) {
			throw new AppError(409, "Assessment is no longer available");
		}

		const existing = await tx.application.findFirst({
			where: {
				assessmentId: assessment.id,
				candidateId: candidate.candidateId,
			},
			select: {
				id: true,
			},
		});

		if (existing) {
			throw new AppError(409, "You have already applied to this assessment");
		}

		const application = await tx.application.create({
			data: {
				assessment: {
					connect: {
						id: assessment.id,
					},
				},
				candidate: {
					connect: {
						id: candidate.candidateId,
					},
				},
				status: ApplicationStatus.APPLIED,
				coverNote: input.coverNote ?? null,
			},
			select: {
				id: true,
				status: true,
				coverNote: true,
				appliedAt: true,
				assessment: {
					select: {
						id: true,
						title: true,
						jobRole: true,
						company: {
							select: {
								id: true,
								name: true,
							},
						},
					},
				},
			},
		});

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.APPLICATION_CREATED,
				entityType: AUDIT_ENTITY_TYPES.APPLICATION,
				entityId: application.id,
				metadata: {
					assessmentId: assessment.id,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return application;
	});
};

const getMine = async (userId: string, query: ApplicationListQuery) => {
	const candidate = await getCandidateContext(userId);

	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "appliedAt",
		sortOrder: "desc",
	});

	const where: Prisma.ApplicationWhereInput = {
		candidateId: candidate.candidateId,
		...(query.status
			? {
					status: query.status,
				}
			: {}),
		...(query.assessmentId
			? {
					assessmentId: query.assessmentId,
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
							assessment: {
								is: {
									title: {
										contains: query.search,
										mode: "insensitive",
									},
								},
							},
						},
						{
							assessment: {
								is: {
									jobRole: {
										contains: query.search,
										mode: "insensitive",
									},
								},
							},
						},
						{
							assessment: {
								is: {
									company: {
										is: {
											name: {
												contains: query.search,
												mode: "insensitive",
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

	const [applications, total] = await prisma.$transaction([
		prisma.application.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				appliedAt: "desc",
			},
			select: {
				id: true,
				status: true,
				coverNote: true,
				rejectionReason: true,
				reviewedAt: true,
				appliedAt: true,
				updatedAt: true,
				assessment: {
					select: {
						id: true,
						title: true,
						jobRole: true,
						difficulty: true,
						durationMinutes: true,
						applicationDeadline: true,
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
				invitation: {
					select: {
						id: true,
						status: true,
						expiresAt: true,
						sentAt: true,
						acceptedAt: true,
					},
				},
			},
		}),
		prisma.application.count({
			where,
		}),
	]);

	return {
		items: applications,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getMineById = async (userId: string, applicationId: string) => {
	const candidate = await getCandidateContext(userId);

	const application = await prisma.application.findFirst({
		where: {
			id: applicationId,
			candidateId: candidate.candidateId,
		},
		select: {
			id: true,
			status: true,
			coverNote: true,
			rejectionReason: true,
			reviewedAt: true,
			appliedAt: true,
			updatedAt: true,
			assessment: {
				select: {
					id: true,
					title: true,
					jobRole: true,
					descriptionHtml: true,
					skills: true,
					difficulty: true,
					durationMinutes: true,
					applicationDeadline: true,
					opensAt: true,
					closesAt: true,
					company: {
						select: {
							id: true,
							name: true,
							logoUrl: true,
							websiteUrl: true,
						},
					},
				},
			},
			invitation: {
				select: {
					id: true,
					status: true,
					expiresAt: true,
					sentAt: true,
					acceptedAt: true,
				},
			},
		},
	});

	if (!application) {
		throw new AppError(404, "Application not found");
	}

	return application;
};

const getRecruiterApplications = async (
	userId: string,
	query: ApplicationListQuery,
) => {
	const recruiter = await getRecruiterContext(userId);

	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "appliedAt",
		sortOrder: "desc",
	});

	const where: Prisma.ApplicationWhereInput = {
		assessment: {
			is: {
				recruiterId: recruiter.recruiterId,
				companyId: recruiter.companyId,
				deletedAt: null,
			},
		},
		...(query.status
			? {
					status: query.status,
				}
			: {}),
		...(query.assessmentId
			? {
					assessmentId: query.assessmentId,
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
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
						{
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
						{
							assessment: {
								is: {
									title: {
										contains: query.search,
										mode: "insensitive",
									},
								},
							},
						},
					],
				}
			: {}),
	};

	const [applications, total] = await prisma.$transaction([
		prisma.application.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				appliedAt: "desc",
			},
			select: {
				id: true,
				status: true,
				coverNote: true,
				rejectionReason: true,
				reviewedAt: true,
				appliedAt: true,
				candidate: {
					select: {
						id: true,
						headline: true,
						experienceYears: true,
						skills: true,
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
						status: true,
					},
				},
			},
		}),
		prisma.application.count({
			where,
		}),
	]);

	return {
		items: applications,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getRecruiterApplicationById = async (
	userId: string,
	applicationId: string,
) => {
	const recruiter = await getRecruiterContext(userId);

	const application = await prisma.application.findFirst({
		where: {
			id: applicationId,
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
			coverNote: true,
			rejectionReason: true,
			reviewedAt: true,
			appliedAt: true,
			updatedAt: true,
			candidate: {
				select: {
					id: true,
					phone: true,
					headline: true,
					bio: true,
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
					status: true,
				},
			},
			invitation: {
				select: {
					id: true,
					status: true,
					expiresAt: true,
					sentAt: true,
					acceptedAt: true,
				},
			},
		},
	});

	if (!application) {
		throw new AppError(404, "Application not found");
	}

	return application;
};

const shortlist = async (
	userId: string,
	applicationId: string,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const application = await tx.application.findFirst({
			where: {
				id: applicationId,
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
			},
		});

		if (!application) {
			throw new AppError(404, "Application not found");
		}

		if (application.status !== ApplicationStatus.APPLIED) {
			throw new AppError(409, "Only applied candidates can be shortlisted");
		}

		const result = await tx.application.updateMany({
			where: {
				id: application.id,
				status: ApplicationStatus.APPLIED,
			},
			data: {
				status: ApplicationStatus.SHORTLISTED,
				reviewedByRecruiterId: recruiter.recruiterId,
				reviewedAt: new Date(),
				rejectionReason: null,
			},
		});

		if (result.count !== 1) {
			throw new AppError(409, "Application status has already changed");
		}

		const updated = await tx.application.findUnique({
			where: {
				id: application.id,
			},
			select: {
				id: true,
				status: true,
				reviewedAt: true,
				rejectionReason: true,
			},
		});

		if (!updated) {
			throw new AppError(404, "Application not found");
		}

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.APPLICATION_SHORTLISTED,
				entityType: AUDIT_ENTITY_TYPES.APPLICATION,
				entityId: application.id,
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

const reject = async (
	userId: string,
	applicationId: string,
	input: RejectApplicationInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await getRecruiterContext(userId, tx);

		const application = await tx.application.findFirst({
			where: {
				id: applicationId,
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
			},
		});

		if (!application) {
			throw new AppError(404, "Application not found");
		}

		if (
			application.status !== ApplicationStatus.APPLIED &&
			application.status !== ApplicationStatus.SHORTLISTED
		) {
			throw new AppError(
				409,
				"Application cannot be rejected in its current status",
			);
		}

		const result = await tx.application.updateMany({
			where: {
				id: application.id,
				status: {
					in: [ApplicationStatus.APPLIED, ApplicationStatus.SHORTLISTED],
				},
			},
			data: {
				status: ApplicationStatus.REJECTED,
				reviewedByRecruiterId: recruiter.recruiterId,
				reviewedAt: new Date(),
				rejectionReason: input.rejectionReason ?? null,
			},
		});

		if (result.count !== 1) {
			throw new AppError(409, "Application status has already changed");
		}

		const updated = await tx.application.findUnique({
			where: {
				id: application.id,
			},
			select: {
				id: true,
				status: true,
				reviewedAt: true,
				rejectionReason: true,
			},
		});

		if (!updated) {
			throw new AppError(404, "Application not found");
		}

		await auditService.create(
			{
				actorUserId: userId,
				action: AUDIT_ACTIONS.APPLICATION_REJECTED,
				entityType: AUDIT_ENTITY_TYPES.APPLICATION,
				entityId: application.id,
				metadata: {
					hasReason: Boolean(input.rejectionReason),
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

export const applicationService = {
	apply,
	getMine,
	getMineById,
	getRecruiterApplications,
	getRecruiterApplicationById,
	shortlist,
	reject,
};
