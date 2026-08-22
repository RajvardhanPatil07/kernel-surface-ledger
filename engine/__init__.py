"""kernel-surface-ledger scoring engine.

Deterministic by contract: every collection is sorted before emission,
no randomness, no wall-clock values in scored fields. Two runs over the
same raw.json produce byte-identical report.json.
"""
