import sanitizeHtml from "sanitize-html";
import { AppError } from "../../../shared/errors/index.js";

const allowedTags = [
	"p",
	"br",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"ul",
	"ol",
	"li",
	"blockquote",
	"pre",
	"code",
	"h2",
	"h3",
	"h4",
	"a",
];

export const sanitizeOptionalAssessmentHtml = (
	value: string | null | undefined,
): string | null | undefined => {
	if (value === undefined || value === null) {
		return value;
	}

	const sanitized = sanitizeHtml(value, {
		allowedTags,
		allowedAttributes: {
			a: ["href"],
		},
		allowedSchemes: ["http", "https", "mailto"],
	});

	const text = sanitizeHtml(sanitized, {
		allowedTags: [],
		allowedAttributes: {},
	})
		.replace(/\s+/g, " ")
		.trim();

	if (!text) {
		return null;
	}

	return sanitized.trim();
};

export const assertAssessmentSchedule = (input: {
	applicationDeadline?: Date | null;
	opensAt?: Date | null;
	closesAt?: Date | null;
}): void => {
	if (input.opensAt && input.closesAt && input.opensAt >= input.closesAt) {
		throw new AppError(400, "closesAt must be after opensAt");
	}

	if (
		input.applicationDeadline &&
		input.closesAt &&
		input.applicationDeadline > input.closesAt
	) {
		throw new AppError(
			400,
			"Application deadline cannot be after assessment closing time",
		);
	}
};
