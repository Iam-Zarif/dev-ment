import sanitizeHtml from "sanitize-html";
import { QuestionType } from "../../../generated/prisma/enums.js";
import { AppError } from "../../../shared/errors/index.js";
import type { CreateQuestionInput } from "./question.validation.js";

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

const sanitizeRichHtml = (value: string, fieldName: string): string => {
	const sanitized = sanitizeHtml(value, {
		allowedTags,
		allowedAttributes: {
			a: ["href"],
		},
		allowedSchemes: ["http", "https", "mailto"],
	});

	const plainText = sanitizeHtml(sanitized, {
		allowedTags: [],
		allowedAttributes: {},
	})
		.replace(/\s+/g, " ")
		.trim();

	if (!plainText) {
		throw new AppError(400, `${fieldName} cannot be empty`);
	}

	return sanitized.trim();
};

export const sanitizeQuestionInput = (
	input: CreateQuestionInput,
): CreateQuestionInput => {
	const contentHtml = sanitizeRichHtml(input.contentHtml, "Question content");

	if (input.type === QuestionType.MCQ) {
		return {
			...input,
			contentHtml,
			options: input.options.map((option) => ({
				...option,
				optionHtml: sanitizeRichHtml(option.optionHtml, "Option content"),
			})),
		};
	}

	return {
		...input,
		contentHtml,
	};
};
