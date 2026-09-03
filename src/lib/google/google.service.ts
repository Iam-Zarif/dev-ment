import { type LoginTicket, OAuth2Client } from "google-auth-library";
import type { GoogleIdentity } from "../../app/modules/auth/auth.interface.js";
import { config } from "../../config/index.js";
import { AppError } from "../../shared/errors/index.js";

let googleClient: OAuth2Client | null = null;

const getGoogleClient = (): OAuth2Client => {
	if (!config.google.clientId) {
		throw new AppError(503, "Google authentication is not configured");
	}

	if (!googleClient) {
		googleClient = new OAuth2Client(config.google.clientId);
	}

	return googleClient;
};

export const verifyGoogleIdToken = async (
	idToken: string,
): Promise<GoogleIdentity> => {
	const client = getGoogleClient();

	let ticket: LoginTicket;

	try {
		ticket = await client.verifyIdToken({
			idToken,
			audience: config.google.clientId,
		});
	} catch {
		throw new AppError(401, "Invalid Google identity token");
	}

	const payload = ticket.getPayload();

	if (!payload?.sub || !payload.email || !payload.email_verified) {
		throw new AppError(401, "Google account could not be verified");
	}

	return {
		sub: payload.sub,
		email: payload.email.toLowerCase(),
		name: payload.name ?? payload.email,
		...(payload.picture ? { picture: payload.picture } : {}),
		...(payload.hd ? { hostedDomain: payload.hd } : {}),
	};
};
