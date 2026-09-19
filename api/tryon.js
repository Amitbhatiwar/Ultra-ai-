export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  const key = process.env.TRYONCLOUD_API_KEY;
  if (!key) return res.status(500).json({error:"TRYONCLOUD_API_KEY is not configured"});
  try {
    const form = new FormData();
    const incoming = await req.formData();
    const person = incoming.get("person_image");
    const garment = incoming.get("garment_image");
    if (!(person instanceof File) || !(garment instanceof File)) {
      return res.status(400).json({error:"Both person_image and garment_image are required"});
    }
    form.append("person_image", person, person.name || "person.jpg");
    form.append("garment_image", garment, garment.name || "garment.jpg");
    const r = await fetch("https://www.tryoncloud.com/api/v1/generate", {
      method:"POST",
      headers:{"X-API-KEY":key},
      body:form
    });
    const type = r.headers.get("content-type") || "";
    if (!r.ok) {
      const data = type.includes("application/json") ? await r.json() : {error: await r.text()};
      return res.status(r.status).json(data);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", type || "image/png");
    res.setHeader("Cache-Control","no-store");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({error:"Try-on backend error", detail:e.message});
  }
}
