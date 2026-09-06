import { z } from "zod";
import {
	PROFILE_CONSTANTS,
	PROFILE_UPLOAD_ASSET_TYPES,
} from "./profile.constant.js";

const nullableTrimmedString = (maxLength: number) =>
	z.union([z.string().trim().min(1).max(maxLength), z.null()]);

const nullableUrl = z.union([z.url(), z.null()]);

const legalNameSchema = z
	.string()
	.trim()
	.min(2)
	.max(PROFILE_CONSTANTS.MAX_LEGAL_NAME_LENGTH);

const skillsSchema = z
	.array(z.string().trim().min(1).max(PROFILE_CONSTANTS.MAX_SKILL_LENGTH))
	.max(PROFILE_CONSTANTS.MAX_SKILLS)
	.transform((skills) => [...new Set(skills)]);

export const updateCandidateProfileSchema = z
	.object({
		legalName: legalNameSchema.optional(),
		phone: nullableTrimmedString(PROFILE_CONSTANTS.MAX_PHONE_LENGTH).optional(),
		headline: nullableTrimmedString(
			PROFILE_CONSTANTS.MAX_HEADLINE_LENGTH,
		).optional(),
		bio: nullableTrimmedString(PROFILE_CONSTANTS.MAX_BIO_LENGTH).optional(),
		experienceYears: z
			.union([z.number().min(0).max(80).multipleOf(0.1), z.null()])
			.optional(),
		skills: skillsSchema.optional(),
		githubUrl: nullableUrl.optional(),
		linkedinUrl: nullableUrl.optional(),
		portfolioUrl: nullableUrl.optional(),
		resumeUrl: nullableUrl.optional(),
		imageUrl: nullableUrl.optional(),
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export const updateRecruiterProfileSchema = z
	.object({
		legalName: legalNameSchema.optional(),
		jobTitle: nullableTrimmedString(
			PROFILE_CONSTANTS.MAX_JOB_TITLE_LENGTH,
		).optional(),
		phone: nullableTrimmedString(PROFILE_CONSTANTS.MAX_PHONE_LENGTH).optional(),
		imageUrl: nullableUrl.optional(),
		companyWebsiteUrl: nullableUrl.optional(),
		companyLogoUrl: nullableUrl.optional(),
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export const createUploadSignatureSchema = z
	.object({
		assetType: z.enum(PROFILE_UPLOAD_ASSET_TYPES),
	})
	.strict();

export type UpdateCandidateProfileInput = z.infer<
	typeof updateCandidateProfileSchema
>;

export type UpdateRecruiterProfileInput = z.infer<
	typeof updateRecruiterProfileSchema
>;

export type CreateUploadSignatureInput = z.infer<
	typeof createUploadSignatureSchema
>;
