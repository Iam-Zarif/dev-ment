const escapeHtml = (value: string): string => {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
};

type OtpTemplateInput = {
	name: string;
	otp: string;
	expiresInMinutes: number;
};

export const createOtpEmailTemplate = (input: OtpTemplateInput) => {
	const name = escapeHtml(input.name);
	const otp = escapeHtml(input.otp);

	return {
		subject: "Verify your Dev-ment account",
		text: `Hello ${input.name}, your Dev-ment verification code is ${input.otp}. It expires in ${input.expiresInMinutes} minutes.`,
		html: `
			<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
				<h2>Dev-ment</h2>
				<p>Hello ${name},</p>
				<p>Use the verification code below to complete your registration.</p>
				<div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${otp}</div>
				<p>This code expires in ${input.expiresInMinutes} minutes.</p>
			</div>
		`,
	};
};
