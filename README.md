# Kitchen Companion

Save recipes, track what is in your kitchen, and see what you can cook today.

    npm start          # serves www/ on http://localhost:5180
    npm run vendor     # re-copy pdf.js, mammoth, lucide, fonts and bundle the Claude SDK

Static site in `www/` (no build step, ES modules). Data lives in the browser (IndexedDB) with JSON export/restore.

- `js/engine.js` – ingredient normalisation (EN/UZ/KO/RU), unit conversion, matching score
  S = 0.55E + 0.15O + 0.15Q + 0.10P + 0.05F, allergies/diet as hard exclusions, grocery list, cooking deduction.
- `js/parser.js` – PDF (pdf.js), DOCX (mammoth), old DOC (best effort), pasted text, schema.org recipes from web pages.
- `js/ai.js` – optional Claude features with the user's own API key: extraction (PDF/photos/links), translation, assistant.
- `js/views/books.js` – recipe books: whole cookbook (PDF or page photos) read in 8-page parts (+1 context page), 3 at a time,
  with pause/resume, retry, cost tracking, dish-photo cropping, and review in page order.
- `js/catalog.js` – multilingual ingredient catalog, allergens, substitutions, 8 starter recipes.
- `js/views/*` – screens. `js/i18n.js` – all interface text in four languages.
