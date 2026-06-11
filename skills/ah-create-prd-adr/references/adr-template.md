# ADR Template & Structure

Use this exact structure when writing the ADR. All content is in English. The ADR documents an
architectural decision that satisfies the paired PRD; read the PRD first for context.

## ADR numbering

Each feature gets its own file (`adr-<repo>-<feature>.md`), so the filename carries no number
and the `ADR-NNNN` in the title is scoped to that file's feature, not the whole directory.

- Use `ADR-0001` by default -- one architectural decision per feature file.
- Only increment (`ADR-0002`, ...) if this same feature already has an ADR file and you are
  recording an additional, distinct decision for it.

## Front matter

```yaml
---
title: "ADR-NNNN: <Decision Title>"
status: "Proposed"
date: "YYYY-MM-DD"
authors: "<Stakeholder Names/Roles>"
tags: ["architecture", "decision"]
supersedes: ""
superseded_by: ""
---
```

Use the current date (`date +%F`). Status is `Proposed` unless the user says otherwise
(other values: `Accepted`, `Rejected`, `Superseded`, `Deprecated`).

## Document sections

Follow this exact order.

### Status

`**Proposed**` | Accepted | Rejected | Superseded | Deprecated

### Context

Problem statement, technical constraints, business requirements, and environmental factors
that force this decision. Explain the forces at play (technical, business, organizational) and
the relevant constraints. This should align with the PRD's problem statement.

### Decision

State the chosen solution clearly and unambiguously, with the rationale for why it was chosen
and the key factors that influenced it. The decision must satisfy the PRD's requirements.

### Consequences

#### Positive

- **POS-001**: Beneficial outcomes and advantages.
- **POS-002**: Performance, maintainability, scalability improvements.
- **POS-003**: Alignment with architectural principles.

#### Negative

- **NEG-001**: Trade-offs, limitations, drawbacks.
- **NEG-002**: Technical debt or complexity introduced.
- **NEG-003**: Risks and future challenges.

Include 1-5 items in each category. Be honest about both sides; use measurable consequences
where possible.

### Alternatives Considered

Document at least 2-3 alternatives (include the "do nothing" option when relevant). Increment
`ALT` codes across all alternatives.

#### <Alternative Name>

- **ALT-001**: **Description**: Brief technical description.
- **ALT-002**: **Rejection Reason**: Why this option was not selected.

### Implementation Notes

- **IMP-001**: Key implementation considerations.
- **IMP-002**: Migration or rollout strategy if applicable.
- **IMP-003**: Monitoring and success criteria.

### References

- **REF-001**: The paired PRD (link it by relative path or filename).
- **REF-002**: Related ADRs.
- **REF-003**: External documentation, standards, or frameworks referenced.

## Quality checklist

Before finishing, verify:

- [ ] Front matter complete; `title` uses `ADR-NNNN:` form; `date` is `YYYY-MM-DD`.
- [ ] Context aligns with the PRD's problem statement.
- [ ] Decision is stated clearly and satisfies the PRD's requirements.
- [ ] At least 1 positive and 1 negative consequence documented.
- [ ] At least 2 alternatives documented with rejection reasons.
- [ ] Implementation notes provide actionable guidance.
- [ ] References link the paired PRD.
- [ ] All coded items use proper format (`POS-001`, `NEG-001`, `ALT-001`, `IMP-001`, `REF-001`).
- [ ] Language is precise; no emojis.
