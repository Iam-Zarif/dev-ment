import { config } from "../config/index.js";
import { CreditSource, UserRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma/index.js";
import { AppError } from "../shared/errors/index.js";
import { hashPassword } from "../shared/utils/index.js";

const seedCandidate = async () => {
	const email = config.seed.candidate.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
			role: true,
		},
	});

	if (existingUser) {
		if (existingUser.role !== UserRole.CANDIDATE) {
			throw new AppError(
				409,
				"Demo candidate email is already used by another role",
			);
		}

		await prisma.candidateProfile.upsert({
			where: {
				userId: existingUser.id,
			},
			update: {},
			create: {
				userId: existingUser.id,
				headline: config.seed.candidate.headline,
				githubUrl: config.seed.candidate.githubUrl,
				linkedinUrl: config.seed.candidate.linkedinUrl,
				portfolioUrl: config.seed.candidate.portfolioUrl,
			},
		});

		return;
	}

	const passwordHash = await hashPassword(config.seed.candidate.password);

	await prisma.user.create({
		data: {
			legalName: config.seed.candidate.name,
			email,
			passwordHash,
			emailVerifiedAt: new Date(),
			role: UserRole.CANDIDATE,
			candidateProfile: {
				create: {
					headline: config.seed.candidate.headline,
					githubUrl: config.seed.candidate.githubUrl,
					linkedinUrl: config.seed.candidate.linkedinUrl,
					portfolioUrl: config.seed.candidate.portfolioUrl,
				},
			},
		},
	});
};

const seedRecruiter = async () => {
	const email = config.seed.recruiter.email.trim().toLowerCase();

	const companyDomain = config.seed.recruiter.company.domain
		.trim()
		.toLowerCase();

	const company = await prisma.company.upsert({
		where: {
			domain: companyDomain,
		},
		update: {
			name: config.seed.recruiter.company.name,
			websiteUrl: config.seed.recruiter.company.website,
			isVerified: true,
			deletedAt: null,
		},
		create: {
			name: config.seed.recruiter.company.name,
			domain: companyDomain,
			websiteUrl: config.seed.recruiter.company.website,
			isVerified: true,
		},
	});

	const existingUser = await prisma.user.findUnique({
		where: {
			email,
		},
		select: {
			id: true,
			role: true,
		},
	});

	let recruiterProfileId: string;

	if (existingUser) {
		if (existingUser.role !== UserRole.RECRUITER) {
			throw new AppError(
				409,
				"Demo recruiter email is already used by another role",
			);
		}

		const recruiterProfile = await prisma.recruiterProfile.upsert({
			where: {
				userId: existingUser.id,
			},
			update: {
				companyId: company.id,
				jobTitle: config.seed.recruiter.jobTitle,
			},
			create: {
				userId: existingUser.id,
				companyId: company.id,
				jobTitle: config.seed.recruiter.jobTitle,
			},
		});

		recruiterProfileId = recruiterProfile.id;
	} else {
		const passwordHash = await hashPassword(config.seed.recruiter.password);

		const user = await prisma.user.create({
			data: {
				legalName: config.seed.recruiter.name,
				email,
				passwordHash,
				emailVerifiedAt: new Date(),
				role: UserRole.RECRUITER,
				recruiterProfile: {
					create: {
						companyId: company.id,
						jobTitle: config.seed.recruiter.jobTitle,
					},
				},
			},
			select: {
				recruiterProfile: {
					select: {
						id: true,
					},
				},
			},
		});

		if (!user.recruiterProfile) {
			throw new AppError(500, "Demo recruiter profile could not be created");
		}

		recruiterProfileId = user.recruiterProfile.id;
	}

	const existingFreeGrant = await prisma.creditGrant.findFirst({
		where: {
			recruiterId: recruiterProfileId,
			source: CreditSource.FREE,
		},
		select: {
			id: true,
		},
	});

	if (existingFreeGrant) {
		return;
	}

	const freePlan = await prisma.pricingPlan.findUnique({
		where: {
			code: "FREE",
		},
		select: {
			id: true,
		},
	});

	if (!freePlan) {
		throw new AppError(500, "FREE pricing plan is not available");
	}

	await prisma.creditGrant.create({
		data: {
			recruiterId: recruiterProfileId,
			planId: freePlan.id,
			source: CreditSource.FREE,
			totalCredits: config.seed.recruiter.freeCredits,
			remainingCredits: config.seed.recruiter.freeCredits,
		},
	});
};

export const seedDemoUsers = async () => {
	await seedCandidate();
	await seedRecruiter();
};
