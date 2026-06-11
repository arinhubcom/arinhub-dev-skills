# PRD Template & Schema

Use this exact structure when writing the PRD. All content is in English.

## File header

The file must open with the title and the preserved source intent:

```markdown
# PRD: <Feature Title>

**Original prompt:** <English translation of the user's original description, verbatim>

---
```

## Quality standards

Requirements must be concrete and measurable. Avoid "fast", "easy", "modern", or "intuitive";
replace them with numbers or observable behavior.

```diff
# Vague (BAD)
- The search should be fast and return relevant results.
- The UI must look modern and be easy to use.

# Concrete (GOOD)
+ The search must return results within 200ms for a 10k record dataset.
+ The search algorithm must achieve >= 85% Precision@10 in benchmark evals.
+ The UI must follow the existing design system and achieve a 100% Lighthouse Accessibility score.
```

## Strict PRD schema

Follow this exact section order.

### 1. Executive Summary

- **Problem Statement**: 1-2 sentences on the pain point.
- **Proposed Solution**: 1-2 sentences on the fix.
- **Success Criteria**: 3-5 measurable items, each coded `SC-01`, `SC-02`, ...

### 2. User Experience & Functionality

- **User Personas**: Who is this for? (a short table works well)
- **User Stories**: `As a [user], I want to [action] so that [benefit].`
- **Acceptance Criteria**: Bulleted "Done" definitions for each story.
- **Non-Goals**: What this feature explicitly does NOT cover (protects scope).

### 3. AI System Requirements (only if the feature involves AI/LLM)

- **Tool Requirements**: Tools, APIs, and models needed.
- **Evaluation Strategy**: How output quality and accuracy are measured.

Omit this section entirely when the feature has no AI component.

### 4. Technical Specifications

- **Architecture Overview**: Data flow and component interaction.
- **Integration Points**: APIs, databases, auth, existing modules.
- **Security & Privacy**: Data handling and compliance considerations.

### 5. Risks & Roadmap

- **Phased Rollout**: MVP -> v1.1 -> v2.0 (or equivalent phases).
- **Technical Risks**: Latency, cost, dependency failures, parity gaps.

## Drafting rules

- If the tech stack was not specified and cannot be inferred from the repository, label it
  `TBD` rather than inventing it.
- Tie each success criterion (`SC-0N`) to something testable, so the downstream tasks pipeline
  can verify it.
- Keep the document self-consistent: every user story should map to at least one success
  criterion or acceptance criterion.
