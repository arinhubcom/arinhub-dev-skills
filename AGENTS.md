# Agents

## Formatting

File formatting is handled by Prettier on save. Do not manually fix formatting issues — they will be resolved automatically when the file is saved.

## Writing & editing SKILL.md files (token optimization)

Keep `skills/ah-*/SKILL.md` prose terse to cut token usage, applying
"caveman" compression
([juliusbrussee/caveman](https://github.com/juliusbrussee/caveman)) to PROSE
ONLY. Applies to every new skill and every edit to an existing one — do not
reintroduce verbose phrasing.

Prose rules:

- Drop articles (a/an/the), filler (just/really/basically/simply/actually),
  pleasantries, hedging. Tighten "This is important because X" → "X."
- Pattern: `[thing] [action] [reason]. [next step]`. Fragments OK. Short
  synonyms. Technical terms exact.
- Intensity: lite (drop filler, keep grammar) for short/orchestration skills;
  full (fragments + short synonyms) for heavy skills. **`ah-workflow` stays
  lite** — its orchestration nuances are fragile.

NEVER compress (preserve verbatim):

1. Fenced code blocks — bash/JS/Python, variable names, gh/git commands,
   heredocs. Byte-identical.
2. File paths & reference links — `[references/x.md](references/x.md)`, script
   paths, `~/.agents/...`, `specs/<branch>/`, progress-file paths.
3. Guardrails — `STOP`, `MUST`, `Never`, `(REQUIRED)`/`(optional)`,
   ask-the-user rules, "do not silently skip steps".
4. Step structure & order — all `###`/`####` headings, numbering, order. No
   merging/removing steps.
5. Validation Checks / Error Handling / Best Practices items and tables —
   substance and table structure intact; tighten wording only.
6. Cross-skill pointers, phase order, input-propagation rules, model/effort
   config lines.
7. Frontmatter — `name` and `argument-hint` unchanged. In `description`, keep
   every quoted "ah ..." trigger phrase and symptom keyword verbatim (these
   drive triggering); remove only connective filler.

Use progressive disclosure: defer verbose templates/specs to `references/*.md`
and keep scripts in `scripts/` rather than inlining them.

After editing a SKILL.md, verify: fenced code blocks byte-identical, all
`references/` links and headings preserved, all trigger phrases preserved.
