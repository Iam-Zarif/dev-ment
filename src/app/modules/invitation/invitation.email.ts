import { config } from "../../../config/index.js";
import { sendEmail } from "../../../lib/email/index.js";
import { createInvitationTemplate } from "../../../templates/assessment/invitation.template.js";

type SendInvitationEmailInput = {
	email: string;
	candidateName: string;
	assessmentTitle: string;
	companyName: string;
	token: string;
	expiresAt: Date;
	assessmentClosesAt: Date | null;
};

const createInvitationUrl = (token: string): string | undefined => {
	if (!config.app.frontendUrl) {
		return undefined;
	}

	const baseUrl = config.app.frontendUrl.replace(/\/+$/g, "");

	return `${baseUrl}/invitations?token=${encodeURIComponent(token)}`;
};

export const sendInvitationEmail = async (
	input: SendInvitationEmailInput,
): Promise<void> => {
	const template = createInvitationTemplate({
		candidateName: input.candidateName,
		assessmentTitle: input.assessmentTitle,
		companyName: input.companyName,
		token: input.token,
		expiresAt: input.expiresAt,
		assessmentClosesAt: input.assessmentClosesAt,
		invitationUrl: createInvitationUrl(input.token),
	});

	await sendEmail({
		to: input.email,
		...template,
	});
};
