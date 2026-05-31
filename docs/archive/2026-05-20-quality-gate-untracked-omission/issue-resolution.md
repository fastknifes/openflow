# Issue Resolution

## Symptom

quality-gate-untracked-omission

## Root Cause

两层根因：1) filterPathsToExactScope/filterPathsToFeatureScope 缺少安全阀（scopeDiffToFeature 在 scopedBlocks.length===0 时回退到 full diff，但 untracked 过滤无此保护）；2) collectFeatureScope 仅通过正则提取精确文件路径，不做目录级推断，导致同目录新文件无法被 scope 覆盖。

## Fix Summary

Issue Work Node recorded. Quality gate (harden + verify) will be performed by openflow-quality-gate.

## Files Involved

_No files recorded._

## Verification Evidence

Typecheck: pass. Quality-gate tests: 36/36 pass. Full test suite: 1482/1482 pass, 0 fail. LSP diagnostics: clean. Changes applied to src/utils/diff-scope.ts.

## Recurrence Signature

Look for recurring reports matching issue slug quality-gate-untracked-omission or symptom: quality-gate-untracked-omission.

## Future AI Guidance

Before changing code for a similar symptom, inspect issue-clarification.md, issue-resolution.md, and archive history for quality-gate-untracked-omission.
