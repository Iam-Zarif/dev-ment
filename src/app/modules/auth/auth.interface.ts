import type { UserRole } from "../../../generated/prisma/enums.js";
import type { AUTH_OTP_PURPOSES } from "./auth.constant.js";

export type OtpPurpose =
	(typeof AUTH_OTP_PURPOSES)[keyof typeof AUTH_OTP_PURPOSES];

export type PendingCandidateRegistration = {
	kind: "CANDIDATE";
	legalName: string;
	email: string;
	passwordHash: string;
};

export type PendingRecruiterRegistration = {
	kind: "RECRUITER";
	legalName: string;
	email: string;
	passwordHash: string;
	companyName: string;
	companyDomain: string;
	jobTitle?: string;
};

export type PendingRegistration =
	| PendingCandidateRegistration
	| PendingRecruiterRegistration;

export type AuthUser = {
	id: string;
	legalName: string;
	email: string;
	role: UserRole;
	imageUrl: string | null;
};

export type AuthSession = {
	user: AuthUser;
	accessToken: string;
	refreshToken: string;
};

export type GoogleIdentity = {
	sub: string;
	email: string;
	name: string;
	picture?: string;
	hostedDomain?: string;
};
