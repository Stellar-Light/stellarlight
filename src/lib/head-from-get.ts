/**
 * A HEAD handler that answers as the route's GET handler does, without the
 * body.
 *
 * Next gives a HEAD request to the GET handler when a route exports no HEAD,
 * with the method still "HEAD". Payload's REST handler matches an endpoint on
 * the request's method, finds none for "head" and answers 404: measured on
 * 2026-11-13, GET /api/media/file/<name> answered 200 and HEAD on the same
 * URL 404, so a link checker that asks with HEAD read every logo as dead.
 * This asks GET as a GET, drops the body (the file is not streamed out of the
 * store) and returns its status and headers.
 */
export const headFromGet =
	<C>(get: (req: Request, ctx: C) => Response | Promise<Response>) =>
	async (req: Request, ctx: C): Promise<Response> => {
		const res = await get(
			new Request(req.url, {
				method: "GET",
				headers: req.headers,
				signal: req.signal,
			}),
			ctx,
		);
		await res.body?.cancel().catch(() => {});
		return new Response(null, {
			status: res.status,
			statusText: res.statusText,
			headers: res.headers,
		});
	};
