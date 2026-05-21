# Feature Identity Naming Constraint

## Human Consensus Summary

Feature identity in OpenFlow is a **stable, deterministic, human-readable identifier** derived from natural-language intent. It is not a random or hashed token, and it is not allowed to silently diverge into multiple identities for what is semantically the same feature.

This constraint governs how feature slugs are derived, how collisions are handled, and what guarantees the system provides about feature identity stability.

## Global Constraints

### 1. No Hash Fallback

OpenFlow **must not** generate `feature-{hash}` or any other random/hashed slug as a fallback when feature identity cannot be confidently inferred.

- If the input is too generic to form a meaningful slug, the system should reject it with `lowConfidenceReason` and ask the user for clarification.
- If the input contains meaningful words but cannot be cleanly sanitized, the system must still derive a deterministic slug from those words (e.g. `untitled-feature` as a last resort, or a sanitized form of the original input), never a hash.
- **Rationale**: Hashes destroy traceability. A human reading `feature-a3f7b2c1` cannot tell what it refers to without looking it up in a registry. This violates the principle that docs/changes/ should be human-navigable.

### 2. Same Name, Same Feature

**When a feature name (slug) is identical, it refers to the same feature session and workspace.**

- Feature identity is **not namespaced by date, session, or chat context** at the slug level.
- If a user starts `/openflow-feature coupon-exchange` today and again tomorrow with the same description, both must resolve to the same feature session (`coupon-exchange`) unless the first session has been explicitly archived.
- The date prefix in the workspace directory (`docs/changes/YYYY-MM-DD-coupon-exchange/`) is a **storage organization detail**, not part of the feature identity. The identity itself is `coupon-exchange`.
- **Rationale**: The user thinks in features, not in dated directories. Forcing the same semantic idea into multiple dated workspaces breaks continuity and makes it impossible to track the lifecycle of a single feature across days.

### 3. Deterministic Derivation

Feature slug derivation must be **pure and deterministic**: the same natural-language input must always produce the same slug.

- No randomness, no timestamps, no session IDs may enter the slug derivation.
- The `deriveFeatureIdentity` function must be a pure function of its `input` string.
- **Rationale**: Determinism enables reproducibility, testability, and predictable workspace paths.

### 4. Chinese-to-English Mapping Is Intentional and Curated

OpenFlow maintains a **fixed, curated dictionary** (`inferChineseFeatureWords`) that maps common Chinese product/technical terms to English equivalents for slug generation.

- **Why it exists**: `sanitizeFeatureName` strips any character outside `[a-z0-9-]`. Pure Chinese input (e.g. `"优惠券兑换"`) would sanitize to an empty or invalid string, making it impossible to generate a filesystem-safe, meaningful slug.
- **How it works**: The dictionary maps concepts like `优惠券` → `coupon`, `登录` → `login`, `质量门` → `quality-gate`. These mapped English words are then combined with any ASCII words already present in the input to form the slug.
- **Maintenance rule**: The dictionary is append-only for new commonly-used terms. Existing mappings must not change, because that would break determinism (Constraint 3).
- **Rationale**: Without this mapping, Chinese-first users would be forced to type English feature names, defeating the natural-language-first design of `/openflow-feature`.

### 5. Rejection Over Obfuscation

When feature intent is too vague or too generic, the system **must reject and ask for clarification** rather than fabricating a misleading slug.

- Inputs like `"future"`, `"feature"`, or `"请收集约束条件，生成相关文档"` must trigger `lowConfidenceReason: 'generic_slug'` or `'generic_instruction'`.
- The user-facing response must explain *why* the input is insufficient and give a concrete example of a better description.
- **Rationale**: A bad name is worse than no name. An obfuscated or placeholder identity makes it harder to find, discuss, and archive the feature later.

## Implications for Implementation

- `src/utils/feature-resolver.ts` must never import or use `crypto.createHash` for slug generation.
- `change-units.json` and `.sisyphus/feature/` session files must be keyed by the semantic slug, not by a hash or synthetic ID.
- Archive and workspace lookup must treat `coupon-exchange` and `2026-05-21-coupon-exchange` as the **same feature** (the latter is just a dated storage directory).
- Tests must not assert the presence of `feature-[0-9a-f]{8}` patterns in generated slugs.

## Acceptance / Verification Mapping

| Expected Behavior | Verification Approach | Status |
|---|---|---|
| `deriveFeatureIdentity` never returns a `feature-{hash}` slug. | Unit test with generic, empty, and Chinese-only inputs; assert no hash pattern in result. | pending |
| Same natural-language input produces the same slug on repeated calls. | Unit test calling `deriveFeatureIdentity` twice with identical input; assert strict equality. | pending |
| Chinese-only input produces a meaningful English-derived slug. | Unit test with `优惠券兑换` → assert slug contains `coupon` and `exchange`. | pending |
| Generic input produces `lowConfidenceReason` instead of a fabricated slug. | Unit test with `future` and generic instructions; assert `lowConfidenceReason` is set. | pending |
