# Agents.md

## Code Style & Architectural Expectations

This repository is optimized for rapid iteration using AI-assisted development.
Consistency and structural clarity matter more than personal stylistic preference.

---

## Naming Conventions

- Use consistent naming across infrastructure, services, and modules.
- Prefer **snake_case** where possible.
  - Use underscores (`_`) when allowed.
  - Use dashes (`-`) only when required by platform constraints (e.g., Kubernetes resource names).
- Avoid mixed casing styles within the same domain.
- Environment identifiers (`development`, `staging`, `production`) should be consistent across Terraform, Kubernetes, and service configuration.

---

## Single Source of Truth

Do not repeat yourself.

- Avoid duplicating user-supplied values across:
  - Terraform variables
  - Helm values
  - Environment files
  - Application configuration
- If duplication appears necessary, step back and restructure.

Where possible:

- Derive values instead of redefining them.
- Centralize configuration into shared modules.
- Use code generation or templating rather than manual repetition.
- Prefer computed outputs over copy/paste configuration.

If enforcing a single source of truth requires additional abstraction, templating, or code generation, prefer that over duplicated configuration.

---

## Configuration Discipline

- All environment-dependent values must flow from a clearly defined root configuration.
- Hardcoding values in application code is discouraged.
- Secrets must never be embedded in source files.
- Environment variables should be injected, not declared ad hoc.

---

## Infrastructure & Service Alignment

- Resource names should map predictably between:
  - Terraform
  - Kubernetes
  - Application configuration
- Avoid “magic” names that only exist in one layer.
- Outputs from Terraform should be consumed directly where possible rather than manually re-entered.

---

## Bias Toward Explicitness

- Prefer clarity over cleverness.
- Avoid implicit behavior that requires tribal knowledge.
- If a configuration dependency exists, document it near its definition.

---

This codebase should remain predictable, reproducible, and mechanically generatable.
Structural integrity is more important than terseness.
