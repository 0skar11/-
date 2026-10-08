---
name: free-llm-apis
description: Use whenever a task needs an LLM API, an AI chat or smart-reply feature, or a free or cheap model provider to call. Points to the curated awesome-free-llm-apis list so the provider is picked from it instead of from memory.
---

# Free LLM APIs

Source of truth: https://github.com/mnfst/awesome-free-llm-apis

A curated list of LLM APIs with a free tier for text inference. Each entry has the base URL, model
names, context and output limits, modalities, rate limits (RPM, RPD) and a link to get an API key.
It has two sections: provider APIs (companies with their own models, e.g. Google Gemini, Mistral AI)
and inference providers (platforms hosting open-weight models, e.g. Groq, OpenRouter).

## When to use it

- A feature needs to call an LLM (AI chat command, smart replies, summaries, moderation help).
- The user asks which free or cheap model API to use, or for its limits.
- Before recommending or hard-coding any provider, base URL or model name.

## How to use it

1. Fetch the list live (WebFetch on the URL above). Limits and models change often, so never answer
   from memory or from an old copy.
2. Pick from the list by what the task needs: context size, output limit, modality, rate limit.
3. Tell the user which provider you picked, its free limits, and where to get the API key.
4. Keep keys in environment variables. Never commit a key.

## In this repo

New features are for the home server only (see CLAUDE.md and `isHomeGuild`). An LLM-backed feature
is parked in `docs/ideas-later.md`; build it only when the owner asks.
