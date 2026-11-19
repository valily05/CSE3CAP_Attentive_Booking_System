// Project lint rules for Attentive Care Connect. Each rule encodes a
// requirement from the scope documents; see the `docs.description`.

const LETTER = /\p{L}/u;
const USER_FACING_ATTRS = new Set(["placeholder", "alt", "title", "aria-label", "aria-description", "aria-placeholder", "label"]);

/** @type {import('eslint').Rule.RuleModule} */
const noRawText = {
  meta: {
    type: "problem",
    docs: { description: "UI copy must come from the EN/ID message catalogs, never be hard-coded" },
    messages: {
      rawText: "Hard-coded text in JSX. Add it to messages/en.json and messages/id.json and use t().",
      rawAttr: "Hard-coded user-facing attribute. Use t() so it is translated.",
    },
    schema: [],
  },
  create(ctx) {
    const isText = (s) => typeof s === "string" && LETTER.test(s);
    return {
      JSXText(node) {
        if (isText(node.value)) ctx.report({ node, messageId: "rawText" });
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === "JSXAttribute") return;
        const e = node.expression;
        if ((e.type === "Literal" && isText(e.value)) || (e.type === "TemplateLiteral" && e.quasis.some((q) => isText(q.value.cooked)))) {
          ctx.report({ node, messageId: "rawText" });
        }
      },
      JSXAttribute(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : "";
        if (!USER_FACING_ATTRS.has(name) || !node.value) return;
        const v = node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value;
        if (v.type === "Literal" && isText(v.value)) ctx.report({ node, messageId: "rawAttr" });
      },
    };
  },
};

const LOCATION = /\b(jakarta|bsd|malang)\b/i;
// IANA time-zone IDs such as "Asia/Jakarta" name a zone, not an office.
const mentionsLocation = (s) => LOCATION.test(s.replace(/\bAsia\/Jakarta\b/g, ""));

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedLocations = {
  meta: {
    type: "problem",
    docs: { description: "Locations are an admin-editable list (Scope §3); never hard-code them" },
    messages: { location: "Hard-coded location. Read locations from the catalog API." },
    schema: [],
  },
  create(ctx) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && mentionsLocation(node.value)) ctx.report({ node, messageId: "location" });
      },
      TemplateElement(node) {
        if (mentionsLocation(node.value.cooked ?? "")) ctx.report({ node, messageId: "location" });
      },
    };
  },
};

const CLINICAL = ["diagnos", "therapynote", "sessionnote", "clinicalnote", "casenote", "symptom", "complaint", "medication", "prescription", "presentingproblem", "reasonforvisit", "mentalcondition", "gejala", "keluhan"];

/** @type {import('eslint').Rule.RuleModule} */
const noClinicalFields = {
  meta: {
    type: "problem",
    docs: { description: "Never model therapy notes, diagnoses or what is said in a session (Scope §13)" },
    messages: { clinical: "'{{name}}' looks like clinical data. This system stores booking facts only." },
    schema: [],
  },
  create(ctx) {
    return {
      Identifier(node) {
        const n = node.name.toLowerCase().replaceAll("_", "");
        if (CLINICAL.some((t) => n.includes(t))) ctx.report({ node, messageId: "clinical", data: { name: node.name } });
      },
    };
  },
};

const LOCALE_METHODS = new Set(["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]);

/** @type {import('eslint').Rule.RuleModule} */
const wibTimeOnly = {
  meta: {
    type: "problem",
    docs: { description: "All times are shown in WIB (G09-4); format dates only through src/lib/time.ts" },
    messages: { useHelper: "Format dates with formatDate/formatTime from @/lib/time so they are always WIB." },
    schema: [],
  },
  create(ctx) {
    const isIntlDTF = (callee) =>
      callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "Intl" &&
      callee.property.type === "Identifier" && callee.property.name === "DateTimeFormat";
    return {
      CallExpression(node) {
        const c = node.callee;
        if ((c.type === "MemberExpression" && c.property.type === "Identifier" && LOCALE_METHODS.has(c.property.name)) || isIntlDTF(c)) {
          ctx.report({ node, messageId: "useHelper" });
        }
      },
      NewExpression(node) {
        if (isIntlDTF(node.callee)) ctx.report({ node, messageId: "useHelper" });
      },
    };
  },
};

const PUBLIC_ENV = /^(NEXT_PUBLIC_|NODE_ENV$)/;

/** @type {import('eslint').Rule.RuleModule} */
const noServerEnvInClient = {
  meta: {
    type: "problem",
    docs: { description: "Secret keys must never reach the browser (Scope §13)" },
    messages: { serverEnv: "'{{name}}' is a server-only variable used in a client component. Only NEXT_PUBLIC_* is safe here." },
    schema: [],
  },
  create(ctx) {
    let client = false;
    const isProcessEnv = (n) =>
      n?.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "process" &&
      n.property.type === "Identifier" && n.property.name === "env";
    const check = (node, name) => {
      if (client && name && !PUBLIC_ENV.test(name)) ctx.report({ node, messageId: "serverEnv", data: { name } });
    };
    return {
      Program(node) {
        client = node.body.some((s) => s.type === "ExpressionStatement" && s.directive === "use client");
      },
      MemberExpression(node) {
        if (isProcessEnv(node.object) && node.property.type === "Identifier") check(node, node.property.name);
      },
      VariableDeclarator(node) {
        if (node.id.type === "ObjectPattern" && isProcessEnv(node.init)) {
          for (const p of node.id.properties) {
            if (p.type === "Property" && p.key.type === "Identifier") check(p, p.key.name);
          }
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "eslint-plugin-attentive" },
  rules: {
    "no-raw-text": noRawText,
    "no-hardcoded-locations": noHardcodedLocations,
    "no-clinical-fields": noClinicalFields,
    "wib-time-only": wibTimeOnly,
    "no-server-env-in-client": noServerEnvInClient,
  },
};

export default plugin;
