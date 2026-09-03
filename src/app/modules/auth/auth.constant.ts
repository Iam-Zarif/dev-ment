export const AUTH_OTP_PURPOSES = {
	CANDIDATE_REGISTRATION: "CANDIDATE_REGISTRATION",
	RECRUITER_REGISTRATION: "RECRUITER_REGISTRATION",
} as const;

export const AUTH_OTP_PURPOSE_VALUES = [
	AUTH_OTP_PURPOSES.CANDIDATE_REGISTRATION,
	AUTH_OTP_PURPOSES.RECRUITER_REGISTRATION,
] as const;

export const AUTH_REDIS_PREFIXES = {
	PENDING_REGISTRATION: "auth:pending:",
	OTP: "auth:otp:",
	OTP_ATTEMPT: "auth:otp-attempt:",
	OTP_COOLDOWN: "auth:otp-cooldown:",
	REFRESH_SESSION: "auth:refresh:",
	REFRESH_USER: "auth:refresh-user:",
	PASSWORD_RESET: "auth:password-reset:",
} as const;

export const AUTH_CONSTANTS = {
	PENDING_REGISTRATION_TTL_SECONDS: 1800,
	PASSWORD_RESET_TTL_SECONDS: 900,
	FREE_RECRUITER_CREDITS: 2,
} as const;

export const BLOCKED_RECRUITER_EMAIL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"yahoo.com",
	"outlook.com",
	"hotmail.com",
	"live.com",
	"icloud.com",
	"me.com",
	"proton.me",
	"protonmail.com",
	"aol.com",
	"mail.com",
	"yandex.com",
	"zoho.com",
]);
