import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config/index.js";

type SendEmailInput = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
	if (transporter) {
		return transporter;
	}

	if (!config.smtp.user || !config.smtp.pass || !config.smtp.fromAddress) {
		throw new Error("SMTP configuration is incomplete");
	}

	transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: {
			user: config.smtp.user,
			pass: config.smtp.pass,
		},
	});

	return transporter;
};

export const sendEmail = async (input: SendEmailInput) => {
	const client = getTransporter();

	const fromAddress = config.smtp.fromAddress;

	if (!fromAddress) {
		throw new Error("SMTP from address is not configured");
	}

	await client.sendMail({
		from: {
			name: config.smtp.fromName,
			address: fromAddress,
		},
		to: input.to,
		subject: input.subject,
		text: input.text,
		html: input.html,
	});
};
