// Optional Claude features: recipe extraction, translation and the cooking assistant.
// The app works without a key; these only run when the user adds their own API key.
import { resolveIngredient } from "./engine.js";
import { hooks } from "./core.js";
import { SUPABASE_URL } from "./sync.js";

let Anthropic;
async function client(settings) {
  if (!Anthropic) Anthropic = (await import("../vendor/anthropic.mjs")).default;
  // A key saved on this device is sent only to api.anthropic.com.
  if (settings.apiKey) return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  // Otherwise use the account's server-side key through the Supabase function (only for allowed emails).
  if (hooks.cloudReady()) {
    const token = await hooks.cloudToken();
    if (token) return new Anthropic({ apiKey: "server-side", baseURL: SUPABASE_URL + "/functions/v1/ai", defaultHeaders: { Authorization: "Bearer " + token }, dangerouslyAllowBrowser: true, maxRetries: 1 });
  }
  throw new Error("NO_KEY");
}

const MODELS_WITH_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
function baseParams(settings) {
  const model = settings.model || "claude-opus-5-5";
  const p = { model };
  if (MODELS_WITH_FALLBACK.has(model)) { p.betas = ["server-side-fallback-2026-07-01"]; p.fallbacks = "default"; }
  return p;
}

const LANG_NAMES = { en: "English", uz: "Uzbek (Latin script)", ko: "Korean", ru: "Russian" };

const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recipes", "problems"],
  properties: {
    problems: { type: "string", description: "Short note on anything unreadable or missing; empty if none." },
    recipes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_number", "title", "description", "language", "servings", "prep_time", "cook_time", "cuisine", "category", "source_page", "photo_box", "ingredients", "steps"],
        properties: {
          post_number: { type: ["integer", "null"], description: "Only when the input is split into numbered posts: the number of the post this recipe came from. Otherwise null." },
          title: { type: "string" },
          description: { type: "string" },
          language: { type: "string", enum: ["en", "uz", "ko", "ru", "other"] },
          servings: { type: ["integer", "null"] },
          prep_time: { type: ["integer", "null"], description: "minutes, only if stated" },
          cook_time: { type: ["integer", "null"], description: "minutes, only if stated" },
          cuisine: { type: "string" },
          category: { type: "string", enum: ["breakfast", "lunch", "dinner", "dessert", "snack", "drink", "other"] },
          source_page: { type: ["integer", "null"] },
          photo_box: {
            type: ["array", "null"], items: { type: "number" },
            description: "Only when the source page shows a photo of this finished dish: [left, top, right, bottom] as fractions 0..1 of the page on source_page. Otherwise null.",
          },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "english_name", "quantity", "unit", "note", "essential", "uncertain"],
              properties: {
                name: { type: "string", description: "as written in the source" },
                english_name: { type: "string", description: "plain English ingredient name, singular, no quantities" },
                quantity: { type: ["number", "null"] },
                unit: { type: "string", enum: ["", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "pc", "clove", "bunch", "slice", "can", "pack", "oz", "lb", "pinch"] },
                note: { type: "string" },
                essential: { type: "boolean" },
                uncertain: { type: "boolean" },
              },
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "timer_seconds"],
              properties: { text: { type: "string" }, timer_seconds: { type: ["integer", "null"] } },
            },
          },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You turn recipe sources (cookbook pages, documents, social media captions, web pages, photos) into structured recipe records.
Rules:
- Return every separate recipe you find. One document can hold many recipes.
- Copy the title, ingredients and steps in the source's own language. Do not translate.
- Never invent values. If a quantity, time or serving count is not written, use null. If an ingredient name is unclear, keep your best reading and set uncertain to true.
- essential is false only for garnishes, "optional", "to serve" or "to taste" extras that the dish works without.
- source_page is the page number in the document where the recipe starts, when known.
- timer_seconds only when the step states a duration.
- If nothing is a recipe, return an empty recipes array and explain in problems.`;

function toRecipe(r) {
  return {
    title: r.title, description: r.description, servings: r.servings, prepTime: r.prep_time, cookTime: r.cook_time,
    cuisine: r.cuisine, category: r.category, sourcePage: r.source_page, language: r.language === "other" ? null : r.language,
    postNumber: r.post_number ?? null,
    photoBox: Array.isArray(r.photo_box) && r.photo_box.length === 4 ? r.photo_box : null,
    ingredients: r.ingredients.map((i) => {
      const id = resolveIngredient(i.english_name) || resolveIngredient(i.name);
      return {
        name: i.name, ingredientId: id, qty: i.quantity, unit: i.unit || (i.quantity != null && id ? "pc" : ""),
        note: i.note, essential: i.essential, uncertain: i.uncertain || !id, original: i.name,
      };
    }),
    steps: r.steps.map((s) => ({ text: s.text, timer: s.timer_seconds || 0 })),
    confidence: "ai",
  };
}

async function runJson(settings, params, { effort = "medium", model, signal } = {}) {
  const c = await client(settings);
  const base = baseParams(model ? { ...settings, model } : settings);
  const stream = c.beta.messages.stream({
    ...base,
    max_tokens: 32000,
    output_config: { effort, format: { type: "json_schema", schema: RECIPE_SCHEMA } },
    system: EXTRACT_SYSTEM,
    ...params,
  }, signal ? { signal } : undefined);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("REFUSED");
  if (msg.stop_reason === "max_tokens") throw new Error("TOO_LONG");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const data = JSON.parse(text);
  return { recipes: data.recipes.map(toRecipe), problems: data.problems, usage: msg.usage, model: msg.model };
}

/**
 * Read part of a recipe book. pages: book page numbers covered by this request (in order),
 * ownFrom..ownTo: the pages this request is responsible for; the rest are context only.
 * part: { kind: "pdf", base64 } | { kind: "images", images: [{ mediaType, base64 }] }
 */
export async function extractBookPart(settings, { part, pages, ownFrom, ownTo, bookTitle, model, signal }) {
  const content = [];
  if (part.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: part.base64 } });
  else if (part.kind === "text") content.push({ type: "text", text: part.text });
  else part.images.forEach((img, i) => {
    content.push({ type: "text", text: `Page ${pages[i]}:` });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  });
  const last = pages[pages.length - 1];
  content.push({
    type: "text",
    text: `These are pages ${pages[0]} to ${last} of the recipe book${bookTitle ? ` "${bookTitle}"` : ""}` +
      (part.kind === "pdf" ? ` (the first page of this PDF is book page ${pages[0]})` : part.kind === "text" ? " (text taken from the PDF; each page starts with a === Page N === line)" : "") + ".\n" +
      `Extract every recipe that STARTS on pages ${ownFrom} to ${ownTo}. ` +
      (last > ownTo ? `Page ${last} is included only so you can finish a recipe that continues onto it; do not extract recipes that start on page ${last}. ` : "") +
      (ownFrom > pages[0] ? `Page ${pages[0]} is included only as context; do not extract recipes that start on it. ` : "") +
      "Use book page numbers for source_page. Include every recipe, even short ones such as sauces, drinks or variations with their own ingredient list. Skip tables of contents, indexes and introductions.",
  });
  return runJson(settings, { messages: [{ role: "user", content }] }, { effort: "low", model, signal });
}

/**
 * source: { kind: "pdf", base64 } | { kind: "image", base64, mediaType } | { kind: "text", text } | { kind: "url", url, text? }
 */
export async function extractWithAI(settings, source) {
  const content = [];
  const tools = [];
  if (source.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: source.base64 } });
  for (const img of source.images || []) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  if (source.kind === "text") content.push({ type: "text", text: "Source text:\n\n" + source.text });
  if (source.kind === "url") {
    tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 });
    content.push({
      type: "text",
      text: `Fetch this page and extract the recipe from its publicly visible content (title, caption, description): ${source.url}\n` +
        (source.text ? `The user also pasted this caption/text from the post:\n\n${source.text}\n` : "") +
        "If the page cannot be read or needs a login, say so in problems and use only the pasted text.",
    });
  }
  content.push({ type: "text", text: "Extract the recipes." });
  return runJson(settings, { messages: [{ role: "user", content }], ...(tools.length ? { tools } : {}) });
}

/** Translate a recipe; the original stays untouched in the app. */
export async function translateRecipe(settings, recipe, lang) {
  const c = await client(settings);
  const schema = {
    type: "object", additionalProperties: false, required: ["title", "description", "ingredients", "steps"],
    properties: {
      title: { type: "string" }, description: { type: "string" },
      ingredients: { type: "array", items: { type: "string" } }, steps: { type: "array", items: { type: "string" } },
    },
  };
  const payload = {
    title: recipe.title, description: recipe.description || "",
    ingredients: recipe.ingredients.map((i) => [i.name, i.note].filter(Boolean).join(", ")),
    steps: recipe.steps.map((s) => s.text),
  };
  const msg = await c.beta.messages.create({
    ...baseParams(settings), max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{
      role: "user",
      content: `Translate this recipe into ${LANG_NAMES[lang]}. Keep the same number of ingredient lines and steps, in the same order. Translate only the names and notes in the ingredient lines (no quantities are included).\n\n${JSON.stringify(payload)}`,
    }],
  });
  if (msg.stop_reason === "refusal") throw new Error("REFUSED");
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

/** Streaming chat for the cooking assistant. onText receives text deltas. */
export async function askAssistant(settings, { history, context, lang }, onText) {
  const c = await client(settings);
  const system = `You are a practical home-cooking assistant inside a kitchen app. Answer in ${LANG_NAMES[lang] || "English"} unless the user writes in another language.
Keep answers short and concrete: quantities, times, temperatures. Use plain text with short lists when helpful.
When you suggest a substitution, say how it changes flavour, texture or the result. Do not present substitutions as identical.
Respect the user's allergies and diet strictly; never suggest an ingredient they are allergic to.
Separate what the saved recipe says from your general cooking advice.
Do not judge whether food is safe to eat from a description or photo; tell the user to check smell, look and dates and follow food-safety guidance when unsure.`;
  const messages = history.map((m) => ({ role: m.role, content: m.text }));
  // Kitchen context goes in a mid-conversation system message so the cached prefix stays stable.
  messages.push({ role: "system", content: "Current kitchen context:\n" + context });
  const stream = c.beta.messages.stream({
    ...baseParams(settings), max_tokens: 8000, output_config: { effort: "low" }, system, messages,
  });
  stream.on("text", (t) => onText(t));
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("REFUSED");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

/**
 * Re-read posts the built-in reader could not parse. posts: [{ n, text }]. Returns recipes with postNumber set.
 */
export async function fixPosts(settings, posts, { model, signal } = {}) {
  const text = posts.map((p) => `### POST ${p.n}\n${p.text}`).join("\n\n");
  const content = [{ type: "text", text: `Below are ${posts.length} separate social-media posts from a recipe collection. ` +
    "For each post that contains a recipe, return it with post_number set to that post's number. A post may hold more than one recipe. " +
    "Posts that are adverts, announcements or tips without a recipe return nothing. Free-written posts often list ingredients inside the text; extract them, but never invent amounts.\n\n" + text }];
  return runJson(settings, { messages: [{ role: "user", content }] }, { effort: "low", model, signal });
}

const IDEAS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "description", "why", "servings", "prep_time", "cook_time", "difficulty", "cuisine", "category", "ingredients", "steps"],
        properties: {
          title: { type: "string" }, description: { type: "string" },
          why: { type: "string", description: "One short sentence: why this dish fits the user's kitchen right now." },
          servings: { type: "integer" }, prep_time: { type: "integer" }, cook_time: { type: "integer" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] }, cuisine: { type: "string" },
          category: { type: "string", enum: ["breakfast", "lunch", "dinner", "dessert", "snack", "drink", "other"] },
          ingredients: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["name", "english_name", "quantity", "unit", "note", "essential", "from_kitchen"],
              properties: {
                name: { type: "string" }, english_name: { type: "string" }, quantity: { type: ["number", "null"] },
                unit: { type: "string", enum: ["", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "pc", "clove", "bunch", "slice", "can", "pack", "pinch"] },
                note: { type: "string" }, essential: { type: "boolean" }, from_kitchen: { type: "boolean" },
              },
            },
          },
          steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "timer_seconds"], properties: { text: { type: "string" }, timer_seconds: { type: ["integer", "null"] } } } },
        },
      },
    },
  },
};

/**
 * Invent dishes from the user's kitchen. opts: { kitchen (text), prefs (text), people, meal, maxTime, mode: "strict"|"flex", count, lang }
 * Allergies are re-checked by the app afterwards; this prompt is not the only safeguard.
 */
export async function suggestFromKitchen(settings, opts) {
  const c = await client(settings);
  const system = `You are a home-cooking assistant that invents practical dishes from what is already in someone's kitchen.
Write everything (titles, ingredient names, steps, why) in ${LANG_NAMES[opts.lang] || "English"}.
Rules:
- Every dish must serve exactly ${opts.people} ${opts.people === 1 ? "person" : "people"}; scale all quantities for that.
- ${opts.mode === "strict" ? "Use ONLY ingredients from the kitchen list plus the listed staples. Do not add anything else." : "Use mainly kitchen ingredients and staples. Each dish may add at most 2 items that are not in the kitchen; mark those with from_kitchen false."}
- Never use more of an ingredient than the kitchen has. If a quantity in the kitchen is unknown, use a normal amount.
- Strictly respect allergies, diet and exclusions: never include those ingredients, not even as garnish.
- Prefer ingredients that expire soon.
- Give different dishes (different main ingredient or cooking method), realistic for a home kitchen, with clear numbered steps and timers only where a step states a time.
- Only suggest dishes you are confident are real and cookable; no invented nutrition numbers.`;
  const user = `Kitchen:\n${opts.kitchen}\n\nUser preferences:\n${opts.prefs}\n\nSuggest ${opts.count} dishes${opts.meal && opts.meal !== "any" ? " for " + opts.meal : ""}${opts.maxTime ? `, each ready in ${opts.maxTime} minutes or less in total` : ""}, for ${opts.people} ${opts.people === 1 ? "person" : "people"}.`;
  const stream = c.beta.messages.stream({
    ...baseParams(settings), max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: IDEAS_SCHEMA } },
    system, messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("REFUSED");
  if (msg.stop_reason === "max_tokens") throw new Error("TOO_LONG");
  const data = JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  return data.ideas.map((r) => ({
    title: r.title, description: r.description, why: r.why, servings: r.servings, prepTime: r.prep_time, cookTime: r.cook_time,
    difficulty: r.difficulty, cuisine: r.cuisine, category: r.category,
    ingredients: r.ingredients.map((i) => {
      const id = resolveIngredient(i.english_name) || resolveIngredient(i.name);
      return { name: i.name, ingredientId: id, qty: i.quantity, unit: i.unit || (i.quantity != null && id ? "pc" : ""), note: i.note, essential: i.essential, fromKitchen: i.from_kitchen };
    }),
    steps: r.steps.map((st) => ({ text: st.text, timer: st.timer_seconds || 0 })),
  }));
}

export const PRICES = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };
export function costOf(usage, model) {
  const p = PRICES[model] || PRICES["claude-opus-5-5"];
  if (!usage) return 0;
  return ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)) * p[0] / 1e6 + (usage.cache_read_input_tokens || 0) * p[0] * 0.1 / 1e6 + (usage.output_tokens || 0) * p[1] / 1e6;
}

export function aiErrorKey(e) {
  const m = String(e?.message || e);
  if (e?.name === "AbortError" || /abort/i.test(m)) return "ai_aborted";
  if (m === "NO_KEY") return "ai_no_key";
  if (m === "REFUSED") return "ai_refused";
  if (m === "TOO_LONG") return "ai_too_long";
  if (e?.status === 503 && /not_configured|not set up/.test(m)) return "ai_server_not_ready";
  if (e?.status === 403 && /not allowed/.test(m)) return "ai_not_allowed";
  if (e?.status === 401) return "ai_bad_key";
  if (e?.status === 429) return "ai_rate";
  if (e?.status === 413) return "ai_file_big";
  return "ai_failed";
}
