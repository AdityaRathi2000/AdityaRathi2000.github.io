import type { APIRoute } from "astro";
import { llmsTxt } from "../lib/plain-profile";

export const GET: APIRoute = async () => new Response(await llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
