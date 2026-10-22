/**
 * What a served response carries that its OpenAPI schema does not declare.
 *
 * AGENTS.md: every served field is in the spec, every served null is
 * declared nullable, every served enum value is in its enum. A test runs a
 * route on fixtures and passes the body here; an empty list means the spec
 * declares everything that body serves. Only what the body serves is
 * checked: a branch the fixture never reaches proves nothing.
 *
 * Findings: a key its object schema does not list, a null its schema does
 * not allow, a value outside its enum, an object or array served where the
 * schema declares no properties or items, and a $ref that resolves to
 * nothing. Not judged: the keys an open map allows (additionalProperties:
 * true or a schema), and types other than null. A oneOf/anyOf passes when
 * any branch passes, and null passes when any branch is nullable. Array
 * indices collapse to [] so one finding names a field once, however many
 * rows serve it.
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
	const out = new Set<string>();
	/** Where a $ref chain ends; undefined, reported, when it ends nowhere. */
	const resolve = (s: unknown, at: string): Node | undefined => {
		let node = s;
		for (let hops = 0; isObject(node) && "$ref" in node; hops++) {
			const ref = String(node.$ref);
			let cur: unknown = spec;
			for (const key of ref.replace(/^#\//, "").split("/"))
				cur = isObject(cur) ? cur[key] : undefined;
			if (!isObject(cur) || hops === 10) {
				out.add(`unresolvable $ref: ${at} (${ref})`);
				return undefined;
			}
			node = cur;
		}
		return isObject(node) ? node : {};
	};
	const branches = (s: Node, key: "allOf" | "oneOf" | "anyOf", at: string) =>
		Array.isArray(s[key])
			? (s[key] as unknown[]).flatMap((b) => resolve(b, at) ?? [])
			: [];
	const nullable = (s: Node, at: string): boolean =>
		s.nullable === true ||
		(Array.isArray(s.type) && s.type.includes("null")) ||
		s.type === "null" ||
		[
			...branches(s, "allOf", at),
			...branches(s, "oneOf", at),
			...branches(s, "anyOf", at),
		].some((b) => nullable(b, at));

	const walk = (raw: unknown, v: unknown, at: string, found: Set<string>) => {
		const s = resolve(raw, at);
		if (!s) return;
		if (v === null) {
			if (!nullable(s, at)) found.add(`undeclared null: ${at}`);
			return;
		}
		const alternatives = [
			...branches(s, "oneOf", at),
			...branches(s, "anyOf", at),
		];
		if (alternatives.length) {
			const tries = alternatives.map((b) => {
				const f = new Set<string>();
				walk(b, v, at, f);
				return f;
			});
			for (const f of tries.reduce((a, b) => (b.size < a.size ? b : a)))
				found.add(f);
			return;
		}
		const parts = [s, ...branches(s, "allOf", at)];
		for (const p of parts)
			if (Array.isArray(p.enum) && !p.enum.includes(v))
				found.add(`value not in enum: ${at} = ${JSON.stringify(v)}`);
		if (Array.isArray(v)) {
			const items = parts.find((p) => "items" in p)?.items;
			if (items !== undefined)
				for (const item of v) walk(items, item, `${at}[]`, found);
			else if (v.length)
				found.add(`undeclared items: ${at}[] (the schema declares none)`);
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
		if (!parts.some((p) => isObject(p.properties)) && extra === undefined) {
			if (Object.keys(v).length)
				found.add(
					`undeclared shape: ${at} (the schema declares no properties)`,
				);
			return;
		}
		for (const [key, child] of Object.entries(v)) {
			if (Object.hasOwn(props, key))
				walk(props[key], child, `${at}.${key}`, found);
			else if (isObject(extra)) walk(extra, child, `${at}{}`, found);
			else if (extra !== true) found.add(`undeclared field: ${at}.${key}`);
		}
	};

	walk(schema, value, "$", out);
	return [...out].sort();
}
