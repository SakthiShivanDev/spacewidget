import { failure } from "./security.mjs";
import { parseDefinition, expandTree, widgetTypes } from "./schema.mjs";
const providers = new Set(["openai", "gemini", "claude"]);
const resultSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    treeJson: { type: "string" },
    stateJson: { type: "string" },
  },
  required: ["name", "treeJson", "stateJson"],
  additionalProperties: false,
};
export class DesignAI {
  constructor(store, vault, options = {}) {
    Object.assign(this, { store, vault });
    this.fetch = options.fetch || fetch;
  }
  async settings(owner) {
    return (
      await this.store.all(
        "SELECT provider,config FROM ai_credentials WHERE owner=?",
        owner,
      )
    ).map((row) => {
      const c = this.vault.open(row.config);
      return { provider: row.provider, model: c.model, configured: true };
    });
  }
  async save(owner, provider, body) {
    if (!providers.has(provider))
      throw failure(400, "Choose OpenAI, Gemini or Claude.");
    if (body.remove === true) {
      await this.store.run(
        "DELETE FROM ai_credentials WHERE owner=? AND provider=?",
        owner,
        provider,
      );
      return this.settings(owner);
    }
    const old = await this.store.one(
      "SELECT config FROM ai_credentials WHERE owner=? AND provider=?",
      owner,
      provider,
    );
    const key = String(
        body.apiKey || (old && this.vault.open(old.config).apiKey) || "",
      ).trim(),
      model = String(body.model || "").trim();
    if (
      key.length < 8 ||
      key.length > 1000 ||
      /\s/.test(key) ||
      !/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)
    )
      throw failure(400, "Enter your provider API key and model ID.");
    await this.store.run(
      "INSERT INTO ai_credentials VALUES(?,?,?) ON CONFLICT(owner,provider) DO UPDATE SET config=excluded.config",
      owner,
      provider,
      this.vault.seal({ apiKey: key, model }),
    );
    return this.settings(owner);
  }
  async generate(owner, app, body) {
    const provider = String(body.provider || ""),
      row = await this.store.one(
        "SELECT config FROM ai_credentials WHERE owner=? AND provider=?",
        owner,
        provider,
      );
    if (!providers.has(provider) || !row)
      throw failure(400, "Save your own provider key in AI settings first.");
    const prompt = String(body.prompt || "").trim(),
      target = body.target === "component" ? "component" : "screen";
    if (prompt.length < 5 || prompt.length > 8000)
      throw failure(400, "Describe the design in 5–8000 characters.");
    const { apiKey, model } = this.vault.open(row.config),
      doc = parseDefinition(JSON.parse(app.draft));
    const instructions = `Design a SpaceWidget ${target}. Return name, treeJson (a JSON-encoded widget object), stateJson (JSON-encoded sample state object). Use only widget types from this catalog: ${JSON.stringify(widgetTypes)}. Nodes use {type,props,style,child,children}; only appropriate child slots. text uses props.text; icons props.icon; container props.padding and decoration. ${target === "component" ? "Use {{props.key}} for component defaults from stateJson." : "Bind sample screen state directly with {{key}}; stateJson contains those root keys."} No actions, code, credentials, network URLs or external images. Prefer layout with safeArea and listView for screen content. Use existing theme colors. Theme: ${JSON.stringify({ ...doc.theme, fonts: undefined })}. Return complete valid JSON, no markdown.`;
    let url,
      headers = { "Content-Type": "application/json" },
      payload;
    if (provider === "openai") {
      url = "https://api.openai.com/v1/responses";
      headers.Authorization = `Bearer ${apiKey}`;
      payload = {
        model,
        store: false,
        max_output_tokens: 12000,
        input: [
          { role: "system", content: instructions },
          { role: "user", content: prompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "studio_design",
            strict: true,
            schema: resultSchema,
          },
        },
      };
    } else if (provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      headers["x-goog-api-key"] = apiKey;
      payload = {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 12000,
          responseMimeType: "application/json",
          responseJsonSchema: resultSchema,
        },
      };
    } else {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model,
        max_tokens: 12000,
        system: instructions,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: { type: "json_schema", schema: resultSchema },
        },
      };
    }
    let result;
    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw failure(
          502,
          `AI provider rejected the request (${response.status}). Check your model access, key and billing.`,
        );
      const reader = response.body?.getReader();
      if (!reader) throw failure(502, "AI returned an empty response.");
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 2 * 1024 * 1024)
            throw failure(502, "AI response exceeded the design limit.");
          chunks.push(Buffer.from(part.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const raw = Buffer.concat(chunks).toString();
      const data = JSON.parse(raw);
      let text;
      if (provider === "openai") {
        if (
          data.status !== "completed" ||
          data.output?.some((o) => o.content?.some((c) => c.type === "refusal"))
        )
          throw failure(
            502,
            "The model declined or did not complete this design.",
          );
        text = data.output
          ?.flatMap((o) => o.content || [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("");
      } else if (provider === "gemini") {
        if (data.candidates?.[0]?.finishReason !== "STOP")
          throw failure(502, "The model did not complete this design.");
        text = data.candidates[0].content?.parts
          ?.map((p) => p.text || "")
          .join("");
      } else {
        if (data.stop_reason !== "end_turn")
          throw failure(502, "The model did not complete this design.");
        text = data.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
      }
      result = JSON.parse(text);
    } catch (error) {
      if (error.statusCode) throw error;
      throw failure(
        502,
        "AI design request failed. Check provider connectivity or try a smaller design.",
      );
    }
    try {
      const tree = JSON.parse(result.treeJson),
        state = JSON.parse(result.stateJson);
      // AI designs are inert until reviewed. Actions, arbitrary endpoints and code
      // cannot be smuggled in by model-generated node properties.
      let count = 0;
      const visit = (value, depth = 0) => {
        if (++count > 10000 || depth > 50) throw new Error();
        if (Array.isArray(value))
          return value.forEach((v) => visit(v, depth + 1));
        if (value && typeof value === "object")
          for (const [key, v] of Object.entries(value)) {
            if (
              /^on[A-Z]/.test(key) ||
              [
                "onTap",
                "onPressed",
                "onChanged",
                "onSubmit",
                "onRefresh",
                "actions",
                "action",
                "javascript",
                "code",
                "url",
                "src",
                "source",
                "componentId",
                "__proto__",
                "constructor",
                "prototype",
              ].includes(key)
            )
              throw new Error();
            visit(v, depth + 1);
          }
      };
      visit({ tree, state });
      const name = String(result.name || "")
        .trim()
        .slice(0, 100);
      if (!name || !state || Array.isArray(state) || typeof state !== "object")
        throw new Error();
      const candidate = structuredClone(doc);
      if (target === "component")
        candidate.components.push({
          id: "ai-proposal",
          name,
          defaults: state,
          tree,
        });
      else
        candidate.screens.push({
          id: "ai-proposal",
          name,
          public: true,
          state,
          queries: [],
          tree,
        });
      const parsed = parseDefinition(candidate);
      expandTree(tree, parsed);
      return {
        target,
        name,
        tree,
        state,
        provider,
        model,
        revision: app.revision,
      };
    } catch {
      throw failure(
        502,
        "The AI returned an unsupported design. Try a simpler prompt; your draft was not changed.",
      );
    }
  }
}
