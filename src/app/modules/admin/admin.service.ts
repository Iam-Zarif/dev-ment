import type { Prisma } from "../../../generated/prisma/client.js";
import {
	AssessmentStatus,
	AttemptStatus,
	CreditSource,
	EvaluationStatus,
	PaymentStatus,
	UserRole,
	UserStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import {
	calculatePagination,
	createPaginationMeta,
	logger,
} from "../../../shared/utils/index.js";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../audit/audit.constant.js";
import { auditService } from "../audit/audit.service.js";
import { authRedis } from "../auth/auth.redis.js";
import type {
	AdminAuditListQuery,
	AdminCompanyListQuery,
	AdminCreditGrantInput,
	AdminPaymentListQuery,
	AdminUserListQuery,
	UpdateCompanyVerificationInput,
	UpdatePricingPlanInput,
	UpdateUserStatusInput,
} from "./admin.validation.js";

const revokeSessionsSafely = async (userId: string): Promise<void> => {
	try {
		await authRedis.revokeAllRefreshSessions(userId);
	} catch (error) {
		logger.error(
			{
				err: error,
				userId,
			},
			"Failed to revoke user refresh sessions",
		);
	}
};

const getDashboard = async () => {
	const [
		users,
		activeUsers,
		blockedUsers,
		deletedUsers,
		admins,
		recruiters,
		candidates,
		companies,
		verifiedCompanies,
		assessments,
		publishedAssessments,
		inProgressAttempts,
		submittedAttempts,
		finalizedEvaluations,
		paidPayments,
		pendingPayments,
	] = await prisma.$transaction([
		prisma.user.count({
			where: {
				deletedAt: null,
			},
		}),
		prisma.user.count({
			where: {
				status: UserStatus.ACTIVE,
				deletedAt: null,
			},
		}),
		prisma.user.count({
			where: {
				status: UserStatus.BLOCKED,
				deletedAt: null,
			},
		}),
		prisma.user.count({
			where: {
				OR: [
					{
						status: UserStatus.DELETED,
					},
					{
						deletedAt: {
							not: null,
						},
					},
				],
			},
		}),
		prisma.user.count({
			where: {
				role: UserRole.ADMIN,
				deletedAt: null,
			},
		}),
		prisma.user.count({
			where: {
				role: UserRole.RECRUITER,
				deletedAt: null,
			},
		}),
		prisma.user.count({
			where: {
				role: UserRole.CANDIDATE,
				deletedAt: null,
			},
		}),
		prisma.company.count({
			where: {
				deletedAt: null,
			},
		}),
		prisma.company.count({
			where: {
				isVerified: true,
				deletedAt: null,
			},
		}),
		prisma.assessment.count({
			where: {
				deletedAt: null,
			},
		}),
		prisma.assessment.count({
			where: {
				status: AssessmentStatus.PUBLISHED,
				deletedAt: null,
			},
		}),
		prisma.attempt.count({
			where: {
				status: AttemptStatus.IN_PROGRESS,
			},
		}),
		prisma.attempt.count({
			where: {
				status: {
					in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED],
				},
			},
		}),
		prisma.attempt.count({
			where: {
				evaluationStatus: EvaluationStatus.FINALIZED,
			},
		}),
		prisma.payment.count({
			where: {
				status: PaymentStatus.PAID,
			},
		}),
		prisma.payment.count({
			where: {
				status: PaymentStatus.PENDING,
			},
		}),
	]);

	return {
		users: {
			total: users,
			active: activeUsers,
			blocked: blockedUsers,
			deleted: deletedUsers,
			admins,
			recruiters,
			candidates,
		},
		companies: {
			total: companies,
			verified: verifiedCompanies,
			unverified: Math.max(companies - verifiedCompanies, 0),
		},
		assessments: {
			total: assessments,
			published: publishedAssessments,
		},
		attempts: {
			inProgress: inProgressAttempts,
			submitted: submittedAttempts,
			finalizedEvaluations,
		},
		payments: {
			paid: paidPayments,
			pending: pendingPayments,
		},
	};
};

const getUsers = async (query: AdminUserListQuery) => {
	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const where: Prisma.UserWhereInput = {
		...(query.role
			? {
					role: query.role,
				}
			: {}),
		...(query.status
			? query.status === UserStatus.DELETED
				? {
						OR: [
							{
								status: UserStatus.DELETED,
							},
							{
								deletedAt: {
									not: null,
								},
							},
						],
					}
				: {
						status: query.status,
						deletedAt: null,
					}
			: {}),
		...(query.search
			? {
					AND: [
						{
							OR: [
								{
									legalName: {
										contains: query.search,
										mode: "insensitive",
									},
								},
								{
									email: {
										contains: query.search,
										mode: "insensitive",
									},
								},
							],
						},
					],
				}
			: {}),
	};

	const [items, total] = await prisma.$transaction([
		prisma.user.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				legalName: true,
				email: true,
				role: true,
				status: true,
				imageUrl: true,
				emailVerifiedAt: true,
				lastLoginAt: true,
				deletedAt: true,
				createdAt: true,
				candidateProfile: {
					select: {
						id: true,
						headline: true,
						skills: true,
					},
				},
				recruiterProfile: {
					select: {
						id: true,
						jobTitle: true,
						company: {
							select: {
								id: true,
								name: true,
								domain: true,
								isVerified: true,
							},
						},
					},
				},
			},
		}),
		prisma.user.count({
			where,
		}),
	]);

	return {
		items,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getUserById = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			id: true,
			legalName: true,
			email: true,
			role: true,
			status: true,
			imageUrl: true,
			emailVerifiedAt: true,
			lastLoginAt: true,
			deletedAt: true,
			createdAt: true,
			updatedAt: true,
			candidateProfile: {
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
				},
			},
			recruiterProfile: {
				select: {
					id: true,
					jobTitle: true,
					phone: true,
					company: {
						select: {
							id: true,
							name: true,
							domain: true,
							websiteUrl: true,
							logoUrl: true,
							isVerified: true,
						},
					},
				},
			},
		},
	});

	if (!user) {
		throw new AppError(404, "User not found");
	}

	return user;
};

const updateUserStatus = async (
	adminUserId: string,
	targetUserId: string,
	input: UpdateUserStatusInput,
	ipAddress?: string,
) => {
	const result = await prisma.$transaction(async (tx) => {
		const target = await tx.user.findUnique({
			where: {
				id: targetUserId,
			},
			select: {
				id: true,
				legalName: true,
				email: true,
				role: true,
				status: true,
				deletedAt: true,
			},
		});

		if (!target) {
			throw new AppError(404, "User not found");
		}

		if (target.id === adminUserId) {
			throw new AppError(409, "You cannot change your own account status");
		}

		if (target.role === UserRole.ADMIN) {
			throw new AppError(409, "Admin account status cannot be changed here");
		}

		if (target.deletedAt || target.status === UserStatus.DELETED) {
			throw new AppError(409, "Deleted user cannot be reactivated or blocked");
		}

		if (target.status === input.status) {
			return {
				...target,
				changed: false,
			};
		}

		const user = await tx.user.update({
			where: {
				id: target.id,
			},
			data: {
				status: input.status,
			},
			select: {
				id: true,
				legalName: true,
				email: true,
				role: true,
				status: true,
			},
		});

		await auditService.create(
			{
				actorUserId: adminUserId,
				action: AUDIT_ACTIONS.ADMIN_USER_STATUS_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.USER,
				entityId: target.id,
				metadata: {
					previousStatus: target.status,
					newStatus: input.status,
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
			...user,
			deletedAt: null,
			changed: true,
		};
	});

	if (result.changed && input.status === UserStatus.BLOCKED) {
		await revokeSessionsSafely(targetUserId);
	}

	return result;
};

const deleteUser = async (
	adminUserId: string,
	targetUserId: string,
	ipAddress?: string,
) => {
	const deleted = await prisma.$transaction(async (tx) => {
		const target = await tx.user.findUnique({
			where: {
				id: targetUserId,
			},
			select: {
				id: true,
				role: true,
				status: true,
				deletedAt: true,
			},
		});

		if (!target) {
			throw new AppError(404, "User not found");
		}

		if (target.id === adminUserId || target.role === UserRole.ADMIN) {
			throw new AppError(409, "Admin account cannot be deleted here");
		}

		if (target.deletedAt || target.status === UserStatus.DELETED) {
			throw new AppError(409, "User is already deleted");
		}

		const now = new Date();

		const user = await tx.user.update({
			where: {
				id: target.id,
			},
			data: {
				status: UserStatus.DELETED,
				deletedAt: now,
			},
			select: {
				id: true,
				role: true,
				status: true,
				deletedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: adminUserId,
				action: AUDIT_ACTIONS.ADMIN_USER_DELETED,
				entityType: AUDIT_ENTITY_TYPES.USER,
				entityId: target.id,
				metadata: {
					previousStatus: target.status,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return user;
	});

	await revokeSessionsSafely(targetUserId);

	return deleted;
};

const getCompanies = async (query: AdminCompanyListQuery) => {
	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const where: Prisma.CompanyWhereInput = {
		deletedAt: null,
		...(query.isVerified !== undefined
			? {
					isVerified: query.isVerified,
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
							name: {
								contains: query.search,
								mode: "insensitive",
							},
						},
						{
							domain: {
								contains: query.search,
								mode: "insensitive",
							},
						},
					],
				}
			: {}),
	};

	const [items, total] = await prisma.$transaction([
		prisma.company.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				name: true,
				domain: true,
				websiteUrl: true,
				logoUrl: true,
				isVerified: true,
				createdAt: true,
				updatedAt: true,
				_count: {
					select: {
						recruiters: true,
						assessments: true,
						questions: true,
					},
				},
			},
		}),
		prisma.company.count({
			where,
		}),
	]);

	return {
		items,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const updateCompanyVerification = async (
	adminUserId: string,
	companyId: string,
	input: UpdateCompanyVerificationInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const company = await tx.company.findFirst({
			where: {
				id: companyId,
				deletedAt: null,
			},
			select: {
				id: true,
				name: true,
				domain: true,
				isVerified: true,
			},
		});

		if (!company) {
			throw new AppError(404, "Company not found");
		}

		if (company.isVerified === input.isVerified) {
			return {
				...company,
				changed: false,
			};
		}

		const updated = await tx.company.update({
			where: {
				id: company.id,
			},
			data: {
				isVerified: input.isVerified,
			},
			select: {
				id: true,
				name: true,
				domain: true,
				isVerified: true,
				updatedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: adminUserId,
				action: AUDIT_ACTIONS.ADMIN_COMPANY_VERIFICATION_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.COMPANY,
				entityId: company.id,
				metadata: {
					previousValue: company.isVerified,
					newValue: input.isVerified,
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
			...updated,
			changed: true,
		};
	});
};

const getPricingPlans = async () => {
	return prisma.pricingPlan.findMany({
		orderBy: {
			price: "asc",
		},
		select: {
			id: true,
			code: true,
			name: true,
			price: true,
			currency: true,
			assessmentCredits: true,
			validityDays: true,
			isActive: true,
			createdAt: true,
			updatedAt: true,
		},
	});
};

const updatePricingPlan = async (
	adminUserId: string,
	planId: string,
	input: UpdatePricingPlanInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const plan = await tx.pricingPlan.findUnique({
			where: {
				id: planId,
			},
			select: {
				id: true,
				code: true,
				name: true,
				price: true,
				currency: true,
				assessmentCredits: true,
				validityDays: true,
				isActive: true,
			},
		});

		if (!plan) {
			throw new AppError(404, "Pricing plan not found");
		}

		const nextPrice = input.price ?? plan.price.toNumber();

		const nextCredits = input.assessmentCredits ?? plan.assessmentCredits;

		const nextValidityDays = input.validityDays ?? plan.validityDays;

		const nextIsActive = input.isActive ?? plan.isActive;

		if (plan.code === "FREE") {
			if (
				nextPrice !== 0 ||
				nextValidityDays !== 0 ||
				!nextIsActive ||
				nextCredits <= 0
			) {
				throw new AppError(
					400,
					"FREE plan must remain active, free, lifetime, and provide credits",
				);
			}
		} else if (
			nextIsActive &&
			(nextPrice <= 0 || nextCredits <= 0 || nextValidityDays <= 0)
		) {
			throw new AppError(
				400,
				"Active paid plans require positive price, credits, and validity",
			);
		}

		const updated = await tx.pricingPlan.update({
			where: {
				id: plan.id,
			},
			data: {
				...(input.name !== undefined
					? {
							name: input.name,
						}
					: {}),
				...(input.price !== undefined
					? {
							price: input.price,
						}
					: {}),
				...(input.assessmentCredits !== undefined
					? {
							assessmentCredits: input.assessmentCredits,
						}
					: {}),
				...(input.validityDays !== undefined
					? {
							validityDays: input.validityDays,
						}
					: {}),
				...(input.isActive !== undefined
					? {
							isActive: input.isActive,
						}
					: {}),
			},
			select: {
				id: true,
				code: true,
				name: true,
				price: true,
				currency: true,
				assessmentCredits: true,
				validityDays: true,
				isActive: true,
				updatedAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: adminUserId,
				action: AUDIT_ACTIONS.ADMIN_PRICING_PLAN_UPDATED,
				entityType: AUDIT_ENTITY_TYPES.PRICING_PLAN,
				entityId: plan.id,
				metadata: {
					code: plan.code,
					previous: {
						name: plan.name,
						price: plan.price.toString(),
						assessmentCredits: plan.assessmentCredits,
						validityDays: plan.validityDays,
						isActive: plan.isActive,
					},
					updated: {
						name: updated.name,
						price: updated.price.toString(),
						assessmentCredits: updated.assessmentCredits,
						validityDays: updated.validityDays,
						isActive: updated.isActive,
					},
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

const getRecruiterCredits = async (recruiterId: string) => {
	const recruiter = await prisma.recruiterProfile.findUnique({
		where: {
			id: recruiterId,
		},
		select: {
			id: true,
			user: {
				select: {
					legalName: true,
					email: true,
					status: true,
					deletedAt: true,
				},
			},
			company: {
				select: {
					id: true,
					name: true,
					isVerified: true,
					deletedAt: true,
				},
			},
		},
	});

	if (!recruiter) {
		throw new AppError(404, "Recruiter not found");
	}

	const now = new Date();

	const grants = await prisma.creditGrant.findMany({
		where: {
			recruiterId,
		},
		orderBy: [
			{
				expiresAt: "asc",
			},
			{
				createdAt: "asc",
			},
		],
		select: {
			id: true,
			source: true,
			totalCredits: true,
			remainingCredits: true,
			expiresAt: true,
			createdAt: true,
			plan: {
				select: {
					code: true,
					name: true,
				},
			},
			payment: {
				select: {
					id: true,
					status: true,
				},
			},
		},
	});

	const availableCredits = grants.reduce((total, grant) => {
		const usable =
			grant.remainingCredits > 0 && (!grant.expiresAt || grant.expiresAt > now);

		return usable ? total + grant.remainingCredits : total;
	}, 0);

	return {
		recruiter,
		availableCredits,
		grants: grants.map((grant) => ({
			...grant,
			isExpired: Boolean(grant.expiresAt && grant.expiresAt <= now),
			isUsable:
				grant.remainingCredits > 0 &&
				(!grant.expiresAt || grant.expiresAt > now),
		})),
	};
};

const grantRecruiterCredits = async (
	adminUserId: string,
	recruiterId: string,
	input: AdminCreditGrantInput,
	ipAddress?: string,
) => {
	return prisma.$transaction(async (tx) => {
		const recruiter = await tx.recruiterProfile.findUnique({
			where: {
				id: recruiterId,
			},
			select: {
				id: true,
				user: {
					select: {
						status: true,
						deletedAt: true,
					},
				},
				company: {
					select: {
						deletedAt: true,
					},
				},
			},
		});

		if (
			!recruiter ||
			recruiter.user.deletedAt ||
			recruiter.company.deletedAt ||
			recruiter.user.status !== UserStatus.ACTIVE
		) {
			throw new AppError(404, "Active recruiter not found");
		}

		const expiresAt = input.validityDays
			? new Date(Date.now() + input.validityDays * 24 * 60 * 60 * 1000)
			: null;

		const grant = await tx.creditGrant.create({
			data: {
				recruiterId: recruiter.id,
				source: CreditSource.ADMIN,
				totalCredits: input.credits,
				remainingCredits: input.credits,
				expiresAt,
			},
			select: {
				id: true,
				recruiterId: true,
				source: true,
				totalCredits: true,
				remainingCredits: true,
				expiresAt: true,
				createdAt: true,
			},
		});

		await auditService.create(
			{
				actorUserId: adminUserId,
				action: AUDIT_ACTIONS.ADMIN_CREDIT_GRANTED,
				entityType: AUDIT_ENTITY_TYPES.CREDIT_GRANT,
				entityId: grant.id,
				metadata: {
					recruiterId: recruiter.id,
					credits: input.credits,
					validityDays: input.validityDays ?? null,
					reason: input.reason ?? null,
				},
				...(ipAddress
					? {
							ipAddress,
						}
					: {}),
			},
			tx,
		);

		return grant;
	});
};

const getPayments = async (query: AdminPaymentListQuery) => {
	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const where: Prisma.PaymentWhereInput = {
		...(query.status
			? {
					status: query.status,
				}
			: {}),
		...(query.recruiterId
			? {
					recruiterId: query.recruiterId,
				}
			: {}),
		...(query.planCode
			? {
					plan: {
						is: {
							code: query.planCode,
						},
					},
				}
			: {}),
		...(query.search
			? {
					OR: [
						{
							recruiter: {
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
							recruiter: {
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
							recruiter: {
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

	const [items, total] = await prisma.$transaction([
		prisma.payment.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				amount: true,
				currency: true,
				status: true,
				stripeCheckoutSessionId: true,
				stripePaymentIntentId: true,
				paidAt: true,
				failedAt: true,
				cancelledAt: true,
				refundedAt: true,
				metadata: true,
				createdAt: true,
				plan: {
					select: {
						id: true,
						code: true,
						name: true,
					},
				},
				recruiter: {
					select: {
						id: true,
						user: {
							select: {
								legalName: true,
								email: true,
							},
						},
						company: {
							select: {
								id: true,
								name: true,
							},
						},
					},
				},
				creditGrant: {
					select: {
						id: true,
						totalCredits: true,
						remainingCredits: true,
						expiresAt: true,
					},
				},
			},
		}),
		prisma.payment.count({
			where,
		}),
	]);

	return {
		items,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

const getAuditLogs = async (query: AdminAuditListQuery) => {
	const pagination = calculatePagination({
		page: query.page,
		limit: query.limit,
		sortBy: "createdAt",
		sortOrder: "desc",
	});

	const where: Prisma.AuditLogWhereInput = {
		...(query.actorUserId
			? {
					actorUserId: query.actorUserId,
				}
			: {}),
		...(query.action
			? {
					action: query.action,
				}
			: {}),
		...(query.entityType
			? {
					entityType: query.entityType,
				}
			: {}),
	};

	const [items, total] = await prisma.$transaction([
		prisma.auditLog.findMany({
			where,
			skip: pagination.skip,
			take: pagination.limit,
			orderBy: {
				createdAt: "desc",
			},
			select: {
				id: true,
				action: true,
				entityType: true,
				entityId: true,
				metadata: true,
				ipAddress: true,
				createdAt: true,
				actor: {
					select: {
						id: true,
						legalName: true,
						email: true,
						role: true,
					},
				},
			},
		}),
		prisma.auditLog.count({
			where,
		}),
	]);

	return {
		items,
		meta: createPaginationMeta(pagination.page, pagination.limit, total),
	};
};

export const adminService = {
	getDashboard,
	getUsers,
	getUserById,
	updateUserStatus,
	deleteUser,
	getCompanies,
	updateCompanyVerification,
	getPricingPlans,
	updatePricingPlan,
	getRecruiterCredits,
	grantRecruiterCredits,
	getPayments,
	getAuditLogs,
};
