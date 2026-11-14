/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from "@payload-config";
import "@payloadcms/next/css";
import {
	REST_DELETE,
	REST_GET,
	REST_OPTIONS,
	REST_PATCH,
	REST_POST,
	REST_PUT,
} from "@payloadcms/next/routes";
import { headFromGet } from "@/lib/head-from-get";

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
// Ours, not Payload's template: without it a HEAD reaches GET's handler as
// "head", matches no endpoint and answers 404 where GET answers 200.
export const HEAD = headFromGet(GET);
