/**
 * What a served response carries that its OpenAPI schema does not declare.
 *
 * AGENTS.md: every served field is in the spec, every served null is
 * declared nullable, every served enum value is in its enum. A test runs a
 * route on fixtures and passes the body here; an empty list means the spec
 * declares everything that body serves. Only what the body serves is
 * checked: a branch the fixture never reaches proves nothing.
 *
 * Never accuses on ambiguity: a schema that declares no properties is not
 * judged, a oneOf/anyOf passes when any branch passes, and null passes when
 * any branch is nullable. Array indices collapse to [] so one finding names
 * a field once, however many rows serve it.
 */

type Node = Record<string, unknown>;
type Spec = { paths?: Record<string, unknown> };

const isObject = (v: unknown): v is Node =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** The JSON schema of an operation's 200 response. */
export function responseSchema(
	spec: Spec,
	path: string,
	method = "get",
): unknown {
	const op = (spec.paths?.[path] as Node | undefined)?.[method] as
		| { responses?: Record<string, Node> }
		| undefined;
	const content = op?.responses?.["200"]?.content as Node | undefined;
	const schema = (content?.["application/json"] as Node | undefined)?.schema;
	if (!schema) throw new Error(`no 200 JSON schema for ${method} ${path}`);
	return schema;
}

export function undeclaredInServed(
	spec: Spec,
	schema: unknown,
	value: unknown,
): string[] {
	const deref = (s: unknown): Node => {
		let node = s;
		for (let i = 0; i < 10 && isObject(node) && "$ref" in node; i++) {
			let cur: unknown = spec;
			for (const key of String(node.$ref).replace(/^#\//, "").split("/"))
				cur = isObject(cur) ? cur[key] : undefined;
			node = cur;
		}
		return isObject(node) ? node : {};
	};
	const branches = (s: Node, key: "allOf" | "oneOf" | "anyOf") =>
		Array.isArray(s[key]) ? (s[key] as unknown[]).map(deref) : [];
	const nullable = (s: Node): boolean =>
		s.nullable === true ||
		(Array.isArray(s.type) && s.type.includes("null")) ||
		s.type === "null" ||
		[
			...branches(s, "allOf"),
			...branches(s, "oneOf"),
			...branches(s, "anyOf"),
		].some(nullable);

	const walk = (raw: unknown, v: unknown, at: string, out: Set<string>) => {
		const s = deref(raw);
		if (v === null) {
			if (!nullable(s)) out.add(`undeclared null: ${at}`);
			return;
		}
		const alternatives = [...branches(s, "oneOf"), ...branches(s, "anyOf")];
		if (alternatives.length) {
			const tries = alternatives.map((b) => {
				const found = new Set<string>();
				walk(b, v, at, found);
				return found;
			});
			const best = tries.reduce((a, b) => (b.size < a.size ? b : a));
			for (const f of best) out.add(f);
			return;
		}
		const parts = [s, ...branches(s, "allOf")];
		const enums = parts.flatMap((p) => (Array.isArray(p.enum) ? [p.enum] : []));
		for (const e of enums)
			if (!e.includes(v))
				out.add(`value not in enum: ${at} = ${JSON.stringify(v)}`);
		if (Array.isArray(v)) {
			const items = parts.find((p) => "items" in p)?.items;
			if (items !== undefined)
				for (const item of v) walk(items, item, `${at}[]`, out);
			return;
		}
		if (!isObject(v)) return;
		const props: Node = Object.assign(
			{},
			...parts.map((p) => (isObject(p.properties) ? p.properties : {})),
		);
		const extra = parts.find(
			(p) => "additionalProperties" in p,
		)?.additionalProperties;
		const declaresShape =
			parts.some((p) => isObject(p.properties)) || extra !== undefined;
		if (!declaresShape) return;
		for (const [key, child] of Object.entries(v)) {
			if (Object.hasOwn(props, key))
				walk(props[key], child, `${at}.${key}`, out);
			else if (isObject(extra)) walk(extra, child, `${at}{}`, out);
			else if (extra !== true) out.add(`undeclared field: ${at}.${key}`);
		}
	};

	const out = new Set<string>();
	walk(schema, value, "$", out);
	return [...out].sort();
}
