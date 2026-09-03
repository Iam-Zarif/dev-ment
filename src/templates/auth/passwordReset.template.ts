const escapeHtml = (value: string): string => {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
};

type PasswordResetTemplateInput = {
	name: string;
	token: string;
	expiresInMinutes: number;
};

export const createPasswordResetTemplate = (
	input: PasswordResetTemplateInput,
) => {
	const name = escapeHtml(input.name);
	const token = escapeHtml(input.token);

	return {
		subject: "Reset your Dev-ment password",
		text: `Hello ${input.name}, your password reset token is ${input.token}. It expires in ${input.expiresInMinutes} minutes.`,
		html: `
			<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
				<h2>Dev-ment</h2>
				<p>Hello ${name},</p>
				<p>Use the token below to reset your password.</p>
				<div style="word-break:break-all;font-weight:700;margin:24px 0">${token}</div>
				<p>This token expires in ${input.expiresInMinutes} minutes.</p>
				<p>If you did not request a password reset, you can ignore this email.</p>
			</div>
		`,
	};
};
