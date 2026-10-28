export function googleMapUrl(value:string){
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase();
 if(host==="maps.app.goo.gl"||host==="goo.gl"&&u.pathname.startsWith("/maps")||["www.google.com","google.com","maps.google.com","www.google.co.th","maps.google.co.th","www.google.ru"].includes(host)&&(u.pathname.startsWith("/maps")||host.startsWith("maps.")))return u;
 }catch{}return null;
}
export function coordinatesFromUrl(value:string){
 let s=value;try{s=decodeURIComponent(value);}catch{}
 // Prefer the place's coordinates to the map viewport centre.
 const exact=s.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
 const query=s.match(/[?&](?:q|query|destination)=(-?[\d.]+)[, ]+(-?[\d.]+)/);
 const at=s.match(/@(-?[\d.]+),(-?[\d.]+)/);
 const m=exact||query||at;if(!m)return null;const latitude=Number(m[1]),longitude=Number(m[2]);
 return validCoordinates(latitude,longitude)?{latitude,longitude}:null;
}
export function validCoordinates(lat:unknown,lng:unknown){return typeof lat==="number"&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&typeof lng==="number"&&Number.isFinite(lng)&&lng>=-180&&lng<=180;}
// Short Google links are resolved only through allowlisted HTTPS Google hosts.
export async function resolveGoogleCoordinates(value:string){
 let url=googleMapUrl(value);if(!url)return null;
 for(let i=0;i<5;i++){
  const coords=coordinatesFromUrl(url.toString());if(coords)return coords;
  if(!["maps.app.goo.gl","goo.gl"].includes(url.hostname))return null;
  const r=await fetch(url,{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(4000)});
  const location=r.headers.get("location");if(!location)return null;
  url=googleMapUrl(new URL(location,url).toString());if(!url)return null;
 }
 return null;
}
