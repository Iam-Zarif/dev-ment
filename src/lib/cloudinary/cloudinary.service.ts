import { v2 as cloudinary } from "cloudinary";
import { config } from "../../config/index.js";
import { AppError } from "../../shared/errors/index.js";

type CloudinaryResourceType = "image" | "raw";

type CreateSignedUploadInput = {
	publicId: string;
	resourceType: CloudinaryResourceType;
	allowedFormats: readonly string[];
};

let configured = false;

const ensureConfigured = () => {
	const { cloudName, apiKey, apiSecret } = config.cloudinary;

	if (!cloudName || !apiKey || !apiSecret) {
		throw new AppError(503, "Cloudinary is not configured");
	}

	if (!configured) {
		cloudinary.config({
			cloud_name: cloudName,
			api_key: apiKey,
			api_secret: apiSecret,
			secure: true,
		});

		configured = true;
	}

	return {
		cloudName,
		apiKey,
		apiSecret,
	};
};

const getRootFolder = (): string => {
	const root = config.cloudinary.rootFolder.replace(/^\/+|\/+$/g, "");

	if (!root) {
		throw new AppError(503, "Cloudinary root folder is not configured");
	}

	return root;
};

export const getCloudinaryUserAssetPublicId = (
	userId: string,
	assetName: string,
): string => `${getRootFolder()}/users/${userId}/${assetName}`;

export const getCloudinaryCompanyAssetPublicId = (
	companyId: string,
	assetName: string,
): string => `${getRootFolder()}/companies/${companyId}/${assetName}`;

export const createSignedCloudinaryUpload = (
	input: CreateSignedUploadInput,
) => {
	const { cloudName, apiKey, apiSecret } = ensureConfigured();

	const timestamp = Math.floor(Date.now() / 1000);

	const signedParams = {
		timestamp,
		public_id: input.publicId,
		overwrite: true,
		invalidate: true,
		allowed_formats: [...input.allowedFormats],
	};

	const signature = cloudinary.utils.api_sign_request(signedParams, apiSecret);

	return {
		uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${input.resourceType}/upload`,
		cloudName,
		apiKey,
		resourceType: input.resourceType,
		allowedFormats: [...input.allowedFormats],
		signature,
		expiresAt: new Date((timestamp + 3600) * 1000).toISOString(),
		...signedParams,
	};
};

export const assertCloudinaryDeliveryUrl = (
	value: string,
	resourceType: CloudinaryResourceType,
	expectedPublicId: string,
): void => {
	const { cloudName } = ensureConfigured();

	let parsed: URL;

	try {
		parsed = new URL(value);
	} catch {
		throw new AppError(400, "Invalid Cloudinary asset URL");
	}

	if (
		parsed.protocol !== "https:" ||
		parsed.hostname !== "res.cloudinary.com"
	) {
		throw new AppError(400, "Asset URL must be a secure Cloudinary URL");
	}

	const segments = parsed.pathname
		.split("/")
		.filter(Boolean)
		.map((segment) => decodeURIComponent(segment));

	if (
		segments[0] !== cloudName ||
		segments[1] !== resourceType ||
		segments[2] !== "upload"
	) {
		throw new AppError(
			400,
			"Cloudinary asset URL is not valid for this account",
		);
	}

	const assetSegments = segments.slice(3);

	if (!assetSegments[0] || !/^v\d+$/.test(assetSegments[0])) {
		throw new AppError(400, "Cloudinary asset URL version is missing");
	}

	assetSegments.shift();

	const assetPath = assetSegments.join("/");

	const normalizedPublicId =
		resourceType === "image"
			? assetPath.replace(/\.[a-z0-9]+$/i, "")
			: assetPath;

	if (normalizedPublicId !== expectedPublicId) {
		throw new AppError(400, "Cloudinary asset does not belong to this profile");
	}
};
