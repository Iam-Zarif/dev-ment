const escapeHtml = (value: string): string => {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
};

type InvitationTemplateInput = {
	candidateName: string;
	assessmentTitle: string;
	companyName: string;
	token: string;
	expiresAt: Date;
	invitationUrl?: string;
	assessmentClosesAt: Date | null;
};

export const createInvitationTemplate = (input: InvitationTemplateInput) => {
	const candidateName = escapeHtml(input.candidateName);
	const assessmentTitle = escapeHtml(input.assessmentTitle);
	const companyName = escapeHtml(input.companyName);
	const token = escapeHtml(input.token);
	const expiresAt = escapeHtml(input.expiresAt.toISOString());

	const linkHtml = input.invitationUrl
		? `<p><a href="${escapeHtml(input.invitationUrl)}">Open assessment invitation</a></p>`
		: "";

	const linkText = input.invitationUrl
		? ` Open invitation: ${input.invitationUrl}`
		: "";
	const assessmentDeadline = input.assessmentClosesAt
		? escapeHtml(input.assessmentClosesAt.toISOString())
		: "Not specified";
	return {
		subject: `Assessment invitation from ${input.companyName}`,
		text: `Hello ${input.candidateName}, ${input.companyName} invited you to ${input.assessmentTitle}. Invitation token: ${input.token}. Assessment deadline: ${input.assessmentClosesAt?.toISOString() ?? "Not specified"}. Invitation expires at ${input.expiresAt.toISOString()}.${linkText}`,
		html: `
		<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
			<h2>Dev-ment</h2>
			<p>Hello ${candidateName},</p>
			<p>${companyName} has invited you to take:</p>
			<h3>${assessmentTitle}</h3>
			${linkHtml}
			<p>Your secure invitation token:</p>
			<div style="word-break:break-all;font-weight:700;margin:20px 0">${token}</div>
			<p>Assessment deadline: ${assessmentDeadline}</p>
			<p>Invitation expires at: ${expiresAt}</p>
		</div>
	`,
	};
};
