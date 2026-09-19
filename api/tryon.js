export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers:{...cors,"Content-Type":"application/json"}
  });
}

async function generateGarmentFromCommand(command){
  const geminiKey = process.env.GEMINI_API_KEY;
  if(!geminiKey){
    throw new Error("TEXT_TO_GARMENT_NOT_CONFIGURED");
  }

  const prompt = `Create a clean, photorealistic fashion product image of the clothing described below, for use as a virtual try-on garment reference.

Clothing request: ${command}

Rules:
- Show ONLY the requested garment(s), centered on a plain light neutral background.
- No person, mannequin, model, face, hands, body or accessories unless the accessory is explicitly part of the clothing request.
- If multiple clothing items are requested (for example shirt and pants), show both items clearly in the same product-style image with enough separation for a try-on engine.
- Preserve the requested colors, clothing type, fit and style.
- High-resolution, realistic fabric texture, front-facing product/catalog photography.
- Do not add logos, brand names, text or watermarks.`;

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
    method:"POST",
    headers:{
      "x-goog-api-key":geminiKey,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gemini-3.1-flash-image",
      input:prompt,
      response_format:{type:"image",mime_type:"image/png",aspect_ratio:"3:4",image_size:"1K"}
    })
  });

  const raw = await res.text();
  if(!res.ok){
    let msg="Gemini garment generation failed";
    try{
      const d=JSON.parse(raw);
      msg=d.error?.message||d.error||msg;
    }catch(_){}
    throw new Error(msg);
  }

  let data;
  try{data=JSON.parse(raw)}catch(_){throw new Error("Invalid Gemini response")}

  let b64=data?.output_image?.data||null;
  if(!b64 && Array.isArray(data?.output)){
    for(const step of data.output){
      if(step?.output_image?.data){b64=step.output_image.data;break}
      if(Array.isArray(step?.content)){
        for(const block of step.content){
          if(block?.type==="image" && block?.data){b64=block.data;break}
          if(block?.image?.data){b64=block.image.data;break}
        }
      }
      if(b64)break;
    }
  }
  if(!b64) throw new Error("Gemini did not return a garment image");

  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:"image/png"});
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, {status:204,headers:cors});
  if (req.method !== "POST") return json({error:"Method not allowed"},405);

  const key=process.env.TRYONCLOUD_API_KEY;
  if(!key) return json({error:"TRYONCLOUD_API_KEY is not configured"},500);

  try{
    const incoming=await req.formData();
    const person=incoming.get("person_image");
    let garment=incoming.get("garment_image");
    const command=(incoming.get("command")||"").toString().trim();

    if(!(person instanceof File)) return json({error:"Person photo is required",code:"NO_PERSON"},400);
    if(person.size>15*1024*1024) return json({error:"Person image must be 15 MB or smaller",code:"BAD_INPUT"},400);

    let generatedFromCommand=false;
    if(!(garment instanceof File)){
      if(!command) return json({error:"Upload clothing photo or enter an outfit command",code:"NO_GARMENT"},400);
      try{
        garment=await generateGarmentFromCommand(command);
        generatedFromCommand=true;
      }catch(e){
        const detail=e?.message||String(e);
        if(detail==="TEXT_TO_GARMENT_NOT_CONFIGURED"){
          return json({
            error:"Text-only try-on is not configured yet. Add GEMINI_API_KEY in Vercel Environment Variables, or upload a clothing photo.",
            code:"TEXT_TO_GARMENT_NOT_CONFIGURED"
          },503);
        }
        return json({error:detail,code:"GARMENT_GENERATION_FAILED"},502);
      }
    }

    if(!(garment instanceof File) && !(garment instanceof Blob)){
      return json({error:"Garment image is required",code:"NO_GARMENT"},400);
    }
    if(garment.size>15*1024*1024) return json({error:"Garment image must be 15 MB or smaller",code:"BAD_INPUT"},400);

    const form=new FormData();
    form.append("person_image",person,person.name||"person.jpg");
    form.append("garment_image",garment,garment instanceof File?(garment.name||"garment.png"):"ai-garment.png");

    const upstream=await fetch("https://www.tryoncloud.com/api/v1/generate",{
      method:"POST",
      headers:{"X-API-KEY":key},
      body:form
    });

    const contentType=upstream.headers.get("content-type")||"image/png";
    const body=await upstream.arrayBuffer();

    if(!upstream.ok){
      let message="TryOnCloud request failed", code;
      try{
        const txt=new TextDecoder().decode(body);
        const data=JSON.parse(txt);
        message=data.error||data.message||message;
        code=data.code;
      }catch(_){
        message=new TextDecoder().decode(body).slice(0,500)||message;
      }
      return json({error:message,code,generatedFromCommand},upstream.status);
    }

    return new Response(body,{
      status:200,
      headers:{
        ...cors,
        "Content-Type":contentType,
        "Cache-Control":"no-store",
        "X-TryOn-Mode":generatedFromCommand?"command":"garment-upload"
      }
    });
  }catch(e){
    return json({
      error:"Try-on backend error",
      detail:e?.message||String(e)
    },500);
  }
}
