import sharp from "sharp";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function readChatInput(request: Request) {
  let text="", file:File|null=null;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const reader=request.body?.getReader();
    if (!reader) throw new Error("EMPTY_BODY");
    const chunks:Uint8Array[]=[];let size=0;
    while (true) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IMAGE_BYTES+65536){await reader.cancel();throw new Error("IMAGE_TOO_LARGE");}chunks.push(value); }
    const bytes=Buffer.concat(chunks);
    const form=await new Response(bytes,{headers:{"Content-Type":request.headers.get("content-type")!}}).formData();
    text=String(form.get("text")||"").trim();
    const entry=form.get("image");if(entry instanceof File && entry.size)file=entry;
  } else {
    const reader=request.body?.getReader();if(!reader)throw new Error("BAD_MESSAGE");
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20000){await reader.cancel();throw new Error("BAD_MESSAGE");}chunks.push(value);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Error("BAD_MESSAGE");}
    if(!body||typeof body!=="object")throw new Error("BAD_MESSAGE");
    text=typeof body.text==="string"?body.text.trim():"";
  }
  if (text.length>4000 || (!text&&!file)) throw new Error("BAD_MESSAGE");
  let image:Buffer|null=null;
  if(file){
    if(file.size>MAX_IMAGE_BYTES)throw new Error("IMAGE_TOO_LARGE");
    const input=Buffer.from(await file.arrayBuffer());
    const isPng=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const isJpeg=input[0]===255&&input[1]===216&&input[2]===255;
    const isWebp=input.subarray(0,4).toString()==="RIFF"&&input.subarray(8,12).toString()==="WEBP";
    if(!isPng&&!isJpeg&&!isWebp)throw new Error("BAD_IMAGE");
    try {
    const metadata=await sharp(input,{limitInputPixels:16000000,animated:false}).metadata();
    if(!["jpeg","png","webp"].includes(metadata.format||""))throw new Error("BAD_IMAGE");
    // Decode and re-encode: strips metadata and prevents SVG/HTML/polyglot uploads.
    image=await sharp(input,{limitInputPixels:16000000,animated:false}).rotate().resize({width:2000,height:2000,fit:"inside",withoutEnlargement:true}).webp({quality:86}).toBuffer();
    if(image.length>MAX_IMAGE_BYTES)throw new Error("IMAGE_TOO_LARGE");
    }catch(error){if(error instanceof Error&&error.message==="IMAGE_TOO_LARGE")throw error;throw new Error("BAD_IMAGE");}
  }
  return {text,image};
}
