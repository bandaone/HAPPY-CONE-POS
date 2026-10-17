import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const suppliedKey = request.headers.get("apikey");
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let secretKeys: string[] = [];
  try {
    const currentKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    secretKeys = Object.values(currentKeys).filter(
      (value): value is string => typeof value === "string",
    );
  } catch {
    return json({ error: "Server credentials are not configured" }, 500);
  }
  if (legacyKey) secretKeys.push(legacyKey);
  if (!suppliedKey || !secretKeys.includes(suppliedKey)) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const body = await request.json();
    if (!body?.store_id || !Array.isArray(body?.events) || body.events.length > 500) {
      return json({ error: "Invalid event batch" }, 422);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      suppliedKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc("ingest_reporting_events", {
      p_store_id: body.store_id,
      p_events: body.events,
    });
    if (error) throw error;
    return json(data);
  } catch (error) {
    console.error("reporting ingestion failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Reporting batch was not accepted" }, 400);
  }
});
