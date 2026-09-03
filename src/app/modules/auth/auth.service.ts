import { getDomain } from "tldts";
import { config } from "../../../config/index.js";
import {
	CreditSource,
	UserRole,
	type UserRole as UserRoleType,
	UserStatus,
} from "../../../generated/prisma/enums.js";
import { sendEmail } from "../../../lib/email/index.js";
import { verifyGoogleIdToken } from "../../../lib/google/index.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import {
	comparePassword,
	createAccessToken,
	createRefreshToken,
	generateOtp,
	generateSecureToken,
	hashPassword,
	hashToken,
	secureHashCompare,
	type VerifiedRefreshTokenPayload,
	verifyRefreshToken,
} from "../../../shared/utils/index.js";
import { createOtpEmailTemplate } from "../../../templates/auth/otp.template.js";
import { createPasswordResetTemplate } from "../../../templates/auth/passwordReset.template.js";
import {
	AUTH_CONSTANTS,
	AUTH_OTP_PURPOSES,
	BLOCKED_RECRUITER_EMAIL_DOMAINS,
} from "./auth.constant.js";
import type {
	AuthSession,
	AuthUser,
	PendingCandidateRegistration,
	PendingRecruiterRegistration,
} from "./auth.interface.js";
import { authRedis } from "./auth.redis.js";
import type {
	ForgotPasswordInput,
	GoogleLoginInput,
	LoginInput,
	RegisterCandidateInput,
	RegisterRecruiterInput,
	ResendOtpInput,
	ResetPasswordInput,
	VerifyOtpInput,
} from "./auth.validation.js";

type UserForAuth = {
	id: string;
	legalName: string;
	email: string;
	role: UserRoleType;
	imageUrl: string | null;
};

const mapAuthUser = (user: UserForAuth): AuthUser => {
	return {
		id: user.id,
		legalName: user.legalName,
		email: user.email,
		role: user.role,
		imageUrl: user.imageUrl,
	};
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const getRecruiterDomain = (email: string): string => {
	const emailDomain = email.split("@")[1];

	if (!emailDomain) {
		throw new AppError(400, "Invalid company email address");
	}

	const domain = getDomain(emailDomain, {
		allowPrivateDomains: true,
	});

	if (!domain) {
		throw new AppError(400, "Invalid company email domain");
	}

	const normalizedDomain = domain.toLowerCase();

	if (BLOCKED_RECRUITER_EMAIL_DOMAINS.has(normalizedDomain)) {
		throw new AppError(
			400,
			"Recruiter registration requires a company email address",
		);
	}

	return normalizedDomain;
};

const assertEmailAvailable = async (email: string) => {
	const existingUser = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
		},
	});

	if (existingUser) {
		throw new AppError(409, "An account with this email already exists");
	}
};

const sendRegistrationOtp = async (
	name: string,
	email: string,
	otp: string,
) => {
	const template = createOtpEmailTemplate({
		name,
		otp,
		expiresInMinutes: Math.ceil(config.otp.expiresInSeconds / 60),
	});

	await sendEmail({
		to: email,
		...template,
	});
};

const createAuthSession = async (user: UserForAuth): Promise<AuthSession> => {
	const sessionId = generateSecureToken(24);

	const tokenPayload = {
		userId: user.id,
		email: user.email,
		role: user.role,
	};

	const accessToken = createAccessToken(tokenPayload);

	const refreshToken = createRefreshToken({
		...tokenPayload,
		sessionId,
	});

	const verifiedRefreshToken = verifyRefreshToken(refreshToken);

	const expiresInSeconds = Math.max(
		verifiedRefreshToken.exp - Math.floor(Date.now() / 1000),
		1,
	);

	await authRedis.saveRefreshSession(user.id, sessionId, expiresInSeconds);

	return {
		user: mapAuthUser(user),
		accessToken,
		refreshToken,
	};
};

const getVerifiedRefreshPayload = (
	refreshToken: string,
): VerifiedRefreshTokenPayload => {
	try {
		return verifyRefreshToken(refreshToken);
	} catch {
		throw new AppError(401, "Invalid or expired refresh token");
	}
};

const registerCandidate = async (input: RegisterCandidateInput) => {
	const email = normalizeEmail(input.email);

	await assertEmailAvailable(email);

	if (
		await authRedis.hasOtpCooldown(
			AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION,
			email,
		)
	) {
		throw new AppError(
			429,
			"Verification code was already sent. Please wait before requesting another code.",
		);
	}

	const passwordHash = await hashPassword(input.password);

	const pending: PendingCandidateRegistration = {
		kind: "CANDIDATE",
		legalName: input.legalName,
		email,
		passwordHash,
	};

	await authRedis.savePendingRegistration(
		AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION,
		email,
		pending,
	);

	const otp = generateOtp();

	await authRedis.saveOtp(
		AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION,
		email,
		hashToken(otp),
	);

	try {
		await sendRegistrationOtp(input.legalName, email, otp);
	} catch (error) {
		await authRedis.clearOtpState(
			AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION,
			email,
		);

		throw error;
	}

	return {
		email,
		expiresInSeconds: config.otp.expiresInSeconds,
	};
};

const registerRecruiter = async (input: RegisterRecruiterInput) => {
	const email = normalizeEmail(input.email);

	await assertEmailAvailable(email);

	const companyDomain = getRecruiterDomain(email);

	if (
		await authRedis.hasOtpCooldown(
			AUTH_OTP_PURPOSES.RECRUITER_REGISTRATION,
			email,
		)
	) {
		throw new AppError(
			429,
			"Verification code was already sent. Please wait before requesting another code.",
		);
	}

	const passwordHash = await hashPassword(input.password);

	const pending: PendingRecruiterRegistration = {
		kind: "RECRUITER",
		legalName: input.legalName,
		email,
		passwordHash,
		companyName: input.companyName,
		companyDomain,
		...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
	};

	await authRedis.savePendingRegistration(
		AUTH_OTP_PURPOSES.RECRUITER_REGISTRATION,
		email,
		pending,
	);

	const otp = generateOtp();

	await authRedis.saveOtp(
		AUTH_OTP_PURPOSES.RECRUITER_REGISTRATION,
		email,
		hashToken(otp),
	);

	try {
		await sendRegistrationOtp(input.legalName, email, otp);
	} catch (error) {
		await authRedis.clearOtpState(
			AUTH_OTP_PURPOSES.RECRUITER_REGISTRATION,
			email,
		);

		throw error;
	}

	return {
		email,
		companyDomain,
		expiresInSeconds: config.otp.expiresInSeconds,
	};
};

const verifyOtp = async (input: VerifyOtpInput): Promise<AuthSession> => {
	const email = normalizeEmail(input.email);

	const pending = await authRedis.getPendingRegistration(input.purpose, email);

	if (!pending) {
		throw new AppError(400, "Registration session expired or does not exist");
	}

	const otpHash = await authRedis.getOtpHash(input.purpose, email);

	if (!otpHash) {
		throw new AppError(400, "Verification code expired. Request a new code.");
	}

	const attempts = await authRedis.incrementOtpAttempt(input.purpose, email);

	if (attempts > config.otp.maxAttempts) {
		await authRedis.clearOtpState(input.purpose, email);

		throw new AppError(
			429,
			"Too many verification attempts. Request a new code.",
		);
	}

	const validOtp = secureHashCompare(otpHash, hashToken(input.otp));

	if (!validOtp) {
		if (attempts >= config.otp.maxAttempts) {
			await authRedis.clearOtpState(input.purpose, email);
		}

		throw new AppError(400, "Invalid verification code");
	}

	await assertEmailAvailable(email);

	let user: UserForAuth;

	if (input.purpose === AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION) {
		if (pending.kind !== "CANDIDATE") {
			throw new AppError(400, "Invalid registration session");
		}

		user = await prisma.$transaction(async (tx) => {
			return tx.user.create({
				data: {
					legalName: pending.legalName,
					email,
					passwordHash: pending.passwordHash,
					emailVerifiedAt: new Date(),
					lastLoginAt: new Date(),
					role: UserRole.CANDIDATE,
					candidateProfile: {
						create: {},
					},
				},
				select: {
					id: true,
					legalName: true,
					email: true,
					role: true,
					imageUrl: true,
				},
			});
		});
	} else {
		if (pending.kind !== "RECRUITER") {
			throw new AppError(400, "Invalid registration session");
		}

		user = await prisma.$transaction(async (tx) => {
			let company = await tx.company.findUnique({
				where: {
					domain: pending.companyDomain,
				},
			});

			if (!company) {
				company = await tx.company.create({
					data: {
						name: pending.companyName,
						domain: pending.companyDomain,
						isVerified: true,
					},
				});
			}

			const freePlan = await tx.pricingPlan.findUnique({
				where: {
					code: "FREE",
				},
			});

			const createdUser = await tx.user.create({
				data: {
					legalName: pending.legalName,
					email,
					passwordHash: pending.passwordHash,
					emailVerifiedAt: new Date(),
					lastLoginAt: new Date(),
					role: UserRole.RECRUITER,
					recruiterProfile: {
						create: {
							company: {
								connect: {
									id: company.id,
								},
							},
							...(pending.jobTitle
								? {
										jobTitle: pending.jobTitle,
									}
								: {}),
						},
					},
				},
				select: {
					id: true,
					legalName: true,
					email: true,
					role: true,
					imageUrl: true,
					recruiterProfile: {
						select: {
							id: true,
						},
					},
				},
			});

			const recruiterProfile = createdUser.recruiterProfile;

			if (!recruiterProfile) {
				throw new AppError(500, "Recruiter profile could not be created");
			}

			const credits =
				freePlan?.assessmentCredits ?? AUTH_CONSTANTS.FREE_RECRUITER_CREDITS;

			await tx.creditGrant.create({
				data: {
					recruiterId: recruiterProfile.id,
					source: CreditSource.FREE,
					totalCredits: credits,
					remainingCredits: credits,
					...(freePlan
						? {
								planId: freePlan.id,
							}
						: {}),
				},
			});

			return {
				id: createdUser.id,
				legalName: createdUser.legalName,
				email: createdUser.email,
				role: createdUser.role,
				imageUrl: createdUser.imageUrl,
			};
		});
	}

	await authRedis.clearRegistrationState(input.purpose, email);

	return createAuthSession(user);
};

const resendOtp = async (input: ResendOtpInput) => {
	const email = normalizeEmail(input.email);

	const pending = await authRedis.getPendingRegistration(input.purpose, email);

	if (!pending) {
		throw new AppError(
			400,
			"Registration session expired. Start registration again.",
		);
	}

	if (await authRedis.hasOtpCooldown(input.purpose, email)) {
		throw new AppError(
			429,
			"Please wait before requesting another verification code",
		);
	}

	const otp = generateOtp();

	await authRedis.saveOtp(input.purpose, email, hashToken(otp));

	try {
		await sendRegistrationOtp(pending.legalName, email, otp);
	} catch (error) {
		await authRedis.clearOtpState(input.purpose, email);

		throw error;
	}

	return {
		email,
		expiresInSeconds: config.otp.expiresInSeconds,
	};
};

const login = async (input: LoginInput): Promise<AuthSession> => {
	const email = normalizeEmail(input.email);

	const user = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
			legalName: true,
			email: true,
			passwordHash: true,
			role: true,
			status: true,
			imageUrl: true,
			deletedAt: true,
		},
	});

	if (!user?.passwordHash || user.deletedAt) {
		throw new AppError(401, "Invalid email or password");
	}

	const validPassword = await comparePassword(
		input.password,
		user.passwordHash,
	);

	if (!validPassword) {
		throw new AppError(401, "Invalid email or password");
	}

	if (user.status !== UserStatus.ACTIVE) {
		throw new AppError(403, "User account is not active");
	}

	await prisma.user.update({
		where: {
			id: user.id,
		},
		data: {
			lastLoginAt: new Date(),
		},
	});

	return createAuthSession(user);
};

const googleLogin = async (input: GoogleLoginInput): Promise<AuthSession> => {
	const identity = await verifyGoogleIdToken(input.idToken);

	const email = normalizeEmail(identity.email);

	const googleOwner = await prisma.user.findUnique({
		where: {
			googleSub: identity.sub,
		},
		select: {
			id: true,
			email: true,
		},
	});

	if (googleOwner && googleOwner.email !== email) {
		throw new AppError(
			409,
			"This Google account is already linked to another account",
		);
	}

	const existingUser = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
			legalName: true,
			email: true,
			role: true,
			status: true,
			imageUrl: true,
			googleSub: true,
			emailVerifiedAt: true,
			deletedAt: true,
		},
	});

	if (existingUser) {
		if (existingUser.deletedAt || existingUser.status !== UserStatus.ACTIVE) {
			throw new AppError(403, "User account is not active");
		}

		if (existingUser.role !== input.role) {
			throw new AppError(
				409,
				`This email is already registered as ${existingUser.role}`,
			);
		}

		if (existingUser.googleSub && existingUser.googleSub !== identity.sub) {
			throw new AppError(409, "A different Google account is already linked");
		}

		const updatedUser = await prisma.user.update({
			where: {
				id: existingUser.id,
			},
			data: {
				googleSub: identity.sub,
				emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
				imageUrl: existingUser.imageUrl ?? identity.picture ?? null,
				lastLoginAt: new Date(),
			},
			select: {
				id: true,
				legalName: true,
				email: true,
				role: true,
				imageUrl: true,
			},
		});

		return createAuthSession(updatedUser);
	}

	let user: UserForAuth;

	if (input.role === UserRole.CANDIDATE) {
		user = await prisma.user.create({
			data: {
				legalName: identity.name,
				email,
				googleSub: identity.sub,
				emailVerifiedAt: new Date(),
				imageUrl: identity.picture ?? null,
				lastLoginAt: new Date(),
				role: UserRole.CANDIDATE,
				candidateProfile: {
					create: {},
				},
			},
			select: {
				id: true,
				legalName: true,
				email: true,
				role: true,
				imageUrl: true,
			},
		});
	} else {
		if (!input.companyName) {
			throw new AppError(
				400,
				"Company name is required for first-time recruiter Google registration",
			);
		}

		const companyDomain = getRecruiterDomain(email);

		const hostedDomain = identity.hostedDomain
			? getDomain(identity.hostedDomain, {
					allowPrivateDomains: true,
				})
			: null;

		if (!hostedDomain || hostedDomain.toLowerCase() !== companyDomain) {
			throw new AppError(
				400,
				"Recruiter Google registration requires a verified Google Workspace company account. Use company email registration otherwise.",
			);
		}

		user = await prisma.$transaction(async (tx) => {
			let company = await tx.company.findUnique({
				where: {
					domain: companyDomain,
				},
			});
			const companyName = input.companyName;

			if (!companyName) {
				throw new AppError(
					400,
					"Company name is required for first-time recruiter Google registration",
				);
			}

			if (!company) {
				company = await tx.company.create({
					data: {
						name: companyName,
						domain: companyDomain,
						isVerified: true,
					},
				});
			}

			const freePlan = await tx.pricingPlan.findUnique({
				where: {
					code: "FREE",
				},
			});

			const createdUser = await tx.user.create({
				data: {
					legalName: identity.name,
					email,
					googleSub: identity.sub,
					emailVerifiedAt: new Date(),
					imageUrl: identity.picture ?? null,
					lastLoginAt: new Date(),
					role: UserRole.RECRUITER,
					recruiterProfile: {
						create: {
							company: {
								connect: {
									id: company.id,
								},
							},
							...(input.jobTitle
								? {
										jobTitle: input.jobTitle,
									}
								: {}),
						},
					},
				},
				select: {
					id: true,
					legalName: true,
					email: true,
					role: true,
					imageUrl: true,
					recruiterProfile: {
						select: {
							id: true,
						},
					},
				},
			});

			const credits =
				freePlan?.assessmentCredits ?? AUTH_CONSTANTS.FREE_RECRUITER_CREDITS;
			const recruiterProfile = createdUser.recruiterProfile;

			if (!recruiterProfile) {
				throw new AppError(500, "Recruiter profile could not be created");
			}

			await tx.creditGrant.create({
				data: {
					recruiterId: recruiterProfile.id,
					source: CreditSource.FREE,
					totalCredits: credits,
					remainingCredits: credits,
					...(freePlan
						? {
								planId: freePlan.id,
							}
						: {}),
				},
			});

			return {
				id: createdUser.id,
				legalName: createdUser.legalName,
				email: createdUser.email,
				role: createdUser.role,
				imageUrl: createdUser.imageUrl,
			};
		});
	}

	return createAuthSession(user);
};

const refresh = async (refreshToken: string): Promise<AuthSession> => {
	const payload = getVerifiedRefreshPayload(refreshToken);

	const sessionOwner = await authRedis.consumeRefreshSession(payload.sessionId);

	if (!sessionOwner || sessionOwner !== payload.userId) {
		throw new AppError(401, "Refresh session is invalid or expired");
	}

	const user = await prisma.user.findUnique({
		where: {
			id: payload.userId,
		},
		select: {
			id: true,
			legalName: true,
			email: true,
			role: true,
			status: true,
			imageUrl: true,
			deletedAt: true,
		},
	});

	if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
		throw new AppError(401, "User account is unavailable");
	}

	return createAuthSession(user);
};

const logout = async (refreshToken: string, authenticatedUserId: string) => {
	const payload = getVerifiedRefreshPayload(refreshToken);

	if (payload.userId !== authenticatedUserId) {
		throw new AppError(
			403,
			"Refresh token does not belong to the authenticated user",
		);
	}

	await authRedis.revokeRefreshSession(payload.sessionId);
};

const forgotPassword = async (input: ForgotPasswordInput) => {
	const email = normalizeEmail(input.email);

	const user = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
			legalName: true,
			status: true,
			deletedAt: true,
		},
	});

	if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
		return;
	}

	const resetToken = generateSecureToken(32);

	const resetTokenHash = hashToken(resetToken);

	await authRedis.savePasswordResetToken(resetTokenHash, user.id);

	const template = createPasswordResetTemplate({
		name: user.legalName,
		token: resetToken,
		expiresInMinutes: AUTH_CONSTANTS.PASSWORD_RESET_TTL_SECONDS / 60,
	});

	try {
		await sendEmail({
			to: email,
			...template,
		});
	} catch (error) {
		await authRedis.deletePasswordResetToken(resetTokenHash);

		throw error;
	}
};

const resetPassword = async (input: ResetPasswordInput) => {
	const tokenHash = hashToken(input.token);

	const userId = await authRedis.consumePasswordResetToken(tokenHash);

	if (!userId) {
		throw new AppError(400, "Password reset token is invalid or expired");
	}

	const user = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			id: true,
			status: true,
			deletedAt: true,
		},
	});

	if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
		throw new AppError(400, "Password reset request is no longer valid");
	}

	const passwordHash = await hashPassword(input.password);

	await prisma.user.update({
		where: {
			id: user.id,
		},
		data: {
			passwordHash,
		},
	});

	await authRedis.revokeAllRefreshSessions(user.id);
};

const getMe = async (userId: string) => {
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
			createdAt: true,
			candidateProfile: true,
			recruiterProfile: {
				include: {
					company: true,
				},
			},
		},
	});

	if (!user) {
		throw new AppError(404, "User not found");
	}

	return user;
};

export const authService = {
	registerCandidate,
	registerRecruiter,
	verifyOtp,
	resendOtp,
	login,
	googleLogin,
	refresh,
	logout,
	forgotPassword,
	resetPassword,
	getMe,
};
