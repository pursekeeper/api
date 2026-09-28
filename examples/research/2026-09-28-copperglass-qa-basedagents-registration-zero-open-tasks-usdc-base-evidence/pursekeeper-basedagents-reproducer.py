#!/usr/bin/env python3
"""Bounded public GET-only BasedAgents evidence check. No key, cookie or mutation."""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://api.basedagents.ai"
AGENT = "ag_4aUsJD3cuqbb4qpzMEK1t5fSj2B3jxzpdRWtQvZ9gZTb"  # public profile
ALLOWED_HOSTS = {"basedagents.ai", "api.basedagents.ai", "registry.basedagents.ai"}
URLS = {
    "manifest": "https://basedagents.ai/.well-known/basedagents.json",
    "agent_manifest": "https://basedagents.ai/.well-known/agent.json",
    "skill": "https://basedagents.ai/skill.md",
    "openapi": BASE + "/v1/openapi.json",
    "x402": BASE + "/.well-known/x402",
    "status": BASE + "/v1/status",
    "open_tasks": BASE + "/v1/tasks?status=open&limit=100&offset=0",
    "our_public_tasks": BASE + f"/v1/tasks?claimer={AGENT}&status=all&limit=100",
    "settled": BASE + "/v1/tasks/settled?limit=50",
    "our_public_profile": BASE + f"/v1/agents/{AGENT}",
    "our_public_wallet": BASE + f"/v1/agents/{AGENT}/wallet",
}
MAX_BYTES = 1_500_000


class FixedHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError("redirect_outside_fixed_hosts")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(FixedHostRedirect())


def fetch(label: str, url: str):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("url_outside_fixed_hosts")
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json, text/markdown, text/plain", "User-Agent": "CopperglassQA-Public-Research/1.0"},
        method="GET",
    )
    with OPENER.open(req, timeout=15) as response:
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("response_too_large")
        meta = {
            "url": url,
            "final_url": response.url,
            "http_status": response.status,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    data = raw.decode("utf-8") if label == "skill" else json.loads(raw)
    return meta, data


def extract(label: str, data):
    if label == "manifest":
        return {"auth": data.get("auth"), "payments": data.get("payments"), "marketplace": data.get("marketplace")}
    if label == "agent_manifest":
        reg = data.get("for_agents", {}).get("register", {}).get("via_api", {})
        pay = data.get("for_agents", {}).get("payments", {})
        return {"registration_pow": reg.get("step2_pow"), "registration_signature": reg.get("step3_sign"), "payment_networks": pay.get("networks"), "payment_token": pay.get("token")}
    if label == "skill":
        lines = data.splitlines()
        words = ("register/init", "register/complete", "proof-of-work", "X-Nonce", "signature covers", "Base mainnet", "Base Sepolia")
        return {"line_count": len(lines), "relevant_lines": [f"{i+1}: {line[:250]}" for i, line in enumerate(lines) if any(w.lower() in line.lower() for w in words)][:20]}
    if label == "openapi":
        paths = data.get("paths", {})
        return {
            "version": data.get("info", {}).get("version"),
            "register_init_summary": paths.get("/v1/register/init", {}).get("post", {}).get("summary"),
            "register_init_difficulty_description": paths.get("/v1/register/init", {}).get("post", {}).get("responses", {}).get("200", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("properties", {}).get("difficulty", {}).get("description"),
            "register_complete_nonce_description": paths.get("/v1/register/complete", {}).get("post", {}).get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("properties", {}).get("nonce", {}).get("description"),
            "register_complete_summary": paths.get("/v1/register/complete", {}).get("post", {}).get("summary"),
            "task_list_description": paths.get("/v1/tasks", {}).get("get", {}).get("description"),
            "task_post_description": paths.get("/v1/tasks", {}).get("post", {}).get("description"),
            "wallet_update_description": paths.get("/v1/agents/{id}/wallet", {}).get("patch", {}).get("description"),
            "settled_feed_description": paths.get("/v1/tasks/settled", {}).get("get", {}).get("description"),
        }
    if label == "x402":
        return {k: data.get(k) for k in ("x402Version", "non_custodial", "flow", "payments_enabled", "escrow", "accepts", "payment_header")}
    if label == "status":
        return {k: data.get(k) for k in ("status", "agents", "tasks", "payments", "escrow", "checked_at")}
    if label == "open_tasks":
        tasks = data.get("tasks", [])
        return {"returned": len(tasks), "next_offset": data.get("next_offset"), "claimable_count_in_returned": sum(t.get("claimable") is True for t in tasks)}
    if label == "our_public_tasks":
        tasks = data.get("tasks", [])
        return {"returned": len(tasks), "statuses": [t.get("status") for t in tasks[:10]]}
    if label == "settled":
        tasks = data.get("tasks", [])
        return {
            "stats": data.get("stats"), "returned": len(tasks), "next_cursor": data.get("next_cursor"),
            "house_sponsored_returned": sum(t.get("sponsored") is True for t in tasks),
            "sample_first_three": [{"task_id": t.get("task_id"), "sponsored": t.get("sponsored"), "bounty": t.get("bounty"), "has_tx_hash": bool(t.get("tx_hash"))} for t in tasks[:3]],
        }
    if label == "our_public_profile":
        return {k: data.get(k) for k in ("agent_id", "name", "status", "registered_at", "wallet_network", "reputation_score")}
    if label == "our_public_wallet":
        return {"agent_id": data.get("agent_id"), "wallet_network": data.get("wallet_network"), "has_wallet_address": bool(data.get("wallet_address"))}
    raise ValueError("unknown_endpoint")


def main():
    out = {"schema": "copperglass-basedagents-public-get-v1", "started_at_utc": datetime.now(timezone.utc).isoformat(), "request_method": "GET only", "results": {}}
    for label, url in URLS.items():
        try:
            meta, data = fetch(label, url)
            out["results"][label] = {"fetch": meta, "extract": extract(label, data)}
        except Exception as exc:
            # Never print response bodies, authorization headers, or exception URLs.
            out["results"][label] = {"url": url, "error_type": type(exc).__name__, "error": str(exc)[:120] if isinstance(exc, ValueError) else "request_failed"}
    out["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0 if all("fetch" in x for x in out["results"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())

