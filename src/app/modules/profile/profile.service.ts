import { UserRole } from "../../../generated/prisma/enums.js";
import {
	assertCloudinaryDeliveryUrl,
	createSignedCloudinaryUpload,
	getCloudinaryCompanyAssetPublicId,
	getCloudinaryUserAssetPublicId,
} from "../../../lib/cloudinary/index.js";
import { prisma } from "../../../lib/prisma/index.js";
import { AppError } from "../../../shared/errors/index.js";
import type {
	CreateUploadSignatureInput,
	UpdateCandidateProfileInput,
	UpdateRecruiterProfileInput,
} from "./profile.validation.js";

const getSafeProfile = async (userId: string) => {
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
			updatedAt: true,
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

const updateCandidate = async (
	userId: string,
	input: UpdateCandidateProfileInput,
) => {
	const candidate = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			role: true,
			candidateProfile: {
				select: {
					id: true,
				},
			},
		},
	});

	if (
		!candidate ||
		candidate.role !== UserRole.CANDIDATE ||
		!candidate.candidateProfile
	) {
		throw new AppError(404, "Candidate profile not found");
	}

	const profileImagePublicId = getCloudinaryUserAssetPublicId(
		userId,
		"profile-image",
	);

	const resumePublicId = getCloudinaryUserAssetPublicId(userId, "resume.pdf");

	if (input.imageUrl) {
		assertCloudinaryDeliveryUrl(input.imageUrl, "image", profileImagePublicId);
	}

	if (input.resumeUrl) {
		assertCloudinaryDeliveryUrl(input.resumeUrl, "raw", resumePublicId);
	}

	await prisma.$transaction(async (tx) => {
		if (input.legalName !== undefined || input.imageUrl !== undefined) {
			await tx.user.update({
				where: {
					id: userId,
				},
				data: {
					...(input.legalName !== undefined
						? {
								legalName: input.legalName,
							}
						: {}),
					...(input.imageUrl !== undefined
						? {
								imageUrl: input.imageUrl,
							}
						: {}),
				},
			});
		}

		const hasCandidateProfileUpdate = [
			input.phone,
			input.headline,
			input.bio,
			input.experienceYears,
			input.skills,
			input.githubUrl,
			input.linkedinUrl,
			input.portfolioUrl,
			input.resumeUrl,
		].some((value) => value !== undefined);

		if (hasCandidateProfileUpdate) {
			await tx.candidateProfile.update({
				where: {
					userId,
				},
				data: {
					...(input.phone !== undefined
						? {
								phone: input.phone,
							}
						: {}),
					...(input.headline !== undefined
						? {
								headline: input.headline,
							}
						: {}),
					...(input.bio !== undefined
						? {
								bio: input.bio,
							}
						: {}),
					...(input.experienceYears !== undefined
						? {
								experienceYears: input.experienceYears,
							}
						: {}),
					...(input.skills !== undefined
						? {
								skills: input.skills,
							}
						: {}),
					...(input.githubUrl !== undefined
						? {
								githubUrl: input.githubUrl,
							}
						: {}),
					...(input.linkedinUrl !== undefined
						? {
								linkedinUrl: input.linkedinUrl,
							}
						: {}),
					...(input.portfolioUrl !== undefined
						? {
								portfolioUrl: input.portfolioUrl,
							}
						: {}),
					...(input.resumeUrl !== undefined
						? {
								resumeUrl: input.resumeUrl,
							}
						: {}),
				},
			});
		}
	});

	return getSafeProfile(userId);
};

const updateRecruiter = async (
	userId: string,
	input: UpdateRecruiterProfileInput,
) => {
	const recruiter = await prisma.recruiterProfile.findUnique({
		where: {
			userId,
		},
		select: {
			id: true,
			companyId: true,
			user: {
				select: {
					role: true,
				},
			},
		},
	});

	if (!recruiter || recruiter.user.role !== UserRole.RECRUITER) {
		throw new AppError(404, "Recruiter profile not found");
	}

	const profileImagePublicId = getCloudinaryUserAssetPublicId(
		userId,
		"profile-image",
	);

	const companyLogoPublicId = getCloudinaryCompanyAssetPublicId(
		recruiter.companyId,
		"logo",
	);

	if (input.imageUrl) {
		assertCloudinaryDeliveryUrl(input.imageUrl, "image", profileImagePublicId);
	}

	if (input.companyLogoUrl) {
		assertCloudinaryDeliveryUrl(
			input.companyLogoUrl,
			"image",
			companyLogoPublicId,
		);
	}

	await prisma.$transaction(async (tx) => {
		if (input.legalName !== undefined || input.imageUrl !== undefined) {
			await tx.user.update({
				where: {
					id: userId,
				},
				data: {
					...(input.legalName !== undefined
						? {
								legalName: input.legalName,
							}
						: {}),
					...(input.imageUrl !== undefined
						? {
								imageUrl: input.imageUrl,
							}
						: {}),
				},
			});
		}

		if (input.jobTitle !== undefined || input.phone !== undefined) {
			await tx.recruiterProfile.update({
				where: {
					id: recruiter.id,
				},
				data: {
					...(input.jobTitle !== undefined
						? {
								jobTitle: input.jobTitle,
							}
						: {}),
					...(input.phone !== undefined
						? {
								phone: input.phone,
							}
						: {}),
				},
			});
		}

		if (
			input.companyWebsiteUrl !== undefined ||
			input.companyLogoUrl !== undefined
		) {
			await tx.company.update({
				where: {
					id: recruiter.companyId,
				},
				data: {
					...(input.companyWebsiteUrl !== undefined
						? {
								websiteUrl: input.companyWebsiteUrl,
							}
						: {}),
					...(input.companyLogoUrl !== undefined
						? {
								logoUrl: input.companyLogoUrl,
							}
						: {}),
				},
			});
		}
	});

	return getSafeProfile(userId);
};

const createUploadSignature = async (
	userId: string,
	role: UserRole,
	input: CreateUploadSignatureInput,
) => {
	if (input.assetType === "PROFILE_IMAGE") {
		if (role !== UserRole.CANDIDATE && role !== UserRole.RECRUITER) {
			throw new AppError(403, "Profile image upload is not allowed");
		}

		return createSignedCloudinaryUpload({
			publicId: getCloudinaryUserAssetPublicId(userId, "profile-image"),
			resourceType: "image",
			allowedFormats: ["jpg", "jpeg", "png", "webp"],
		});
	}

	if (input.assetType === "CANDIDATE_RESUME") {
		if (role !== UserRole.CANDIDATE) {
			throw new AppError(403, "Only candidates can upload a resume");
		}

		return createSignedCloudinaryUpload({
			publicId: getCloudinaryUserAssetPublicId(userId, "resume.pdf"),
			resourceType: "raw",
			allowedFormats: ["pdf"],
		});
	}

	if (role !== UserRole.RECRUITER) {
		throw new AppError(403, "Only recruiters can upload a company logo");
	}

	const recruiter = await prisma.recruiterProfile.findUnique({
		where: {
			userId,
		},
		select: {
			companyId: true,
		},
	});

	if (!recruiter) {
		throw new AppError(404, "Recruiter profile not found");
	}

	return createSignedCloudinaryUpload({
		publicId: getCloudinaryCompanyAssetPublicId(recruiter.companyId, "logo"),
		resourceType: "image",
		allowedFormats: ["jpg", "jpeg", "png", "webp"],
	});
};

export const profileService = {
	updateCandidate,
	updateRecruiter,
	createUploadSignature,
};
