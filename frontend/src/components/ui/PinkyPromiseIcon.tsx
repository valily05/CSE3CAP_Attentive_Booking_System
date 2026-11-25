"use client";
import { useId, type SVGProps } from "react";

/** The supplied icon, recoloured at render time so its white backdrop is transparent. */
export function PinkyPromiseIcon({size=26,...props}:SVGProps<SVGSVGElement>&{size?:number}) {
 const filterId=`promise-${useId().replace(/:/g,"")}`;
 return <svg width={size} height={size} viewBox="210 230 1110 600" data-icon="pinky-promise" {...props}>
  <defs><filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
   <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1" result="ink"/>
   <feFlood floodColor="currentColor" result="brown"/><feComposite in="brown" in2="ink" operator="in"/>
  </filter></defs>
  <image href="/brand/privacy-pinky-promise.png" width="1536" height="1024" filter={`url(#${filterId})`}/>
 </svg>;
}
