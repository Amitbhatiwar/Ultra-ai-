export const config = { runtime: "edge" };

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  const key = process.env.TRYONCLOUD_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "TRYONCLOUD_API_KEY is not configured" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const incoming = await req.formData();
    const person = incoming.get("person_image");
    const garment = incoming.get("garment_image");

    if (!(person instanceof File) || !(garment instanceof File)) {
      return new Response(JSON.stringify({ error: "Both person_image and garment_image are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    if (person.size > 15 * 1024 * 1024 || garment.size > 15 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Each image must be 15 MB or smaller" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const form = new FormData();
    form.append("person_image", person, person.name || "person.jpg");
    form.append("garment_image", garment, garment.name || "garment.jpg");

    const upstream = await fetch("https://www.tryoncloud.com/api/v1/generate", {
      method: "POST",
      headers: { "X-API-KEY": key },
      body: form
    });

    const contentType = upstream.headers.get("content-type") || "image/png";
    const body = await upstream.arrayBuffer();

    if (!upstream.ok) {
      let message = "TryOnCloud request failed";
      try {
        const txt = new TextDecoder().decode(body);
        const data = JSON.parse(txt);
        message = data.error || data.message || message;
        return new Response(JSON.stringify({ error: message, code: data.code }), {
          status: upstream.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      } catch (_) {
        message = new TextDecoder().decode(body).slice(0, 500) || message;
        return new Response(JSON.stringify({ error: message }), {
          status: upstream.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Try-on backend error",
      detail: e?.message || String(e)
    }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}
