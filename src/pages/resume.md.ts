import type { APIRoute } from "astro";
import { resumeMd } from "../lib/plain-profile";

export const GET: APIRoute = async () => new Response(await resumeMd(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
