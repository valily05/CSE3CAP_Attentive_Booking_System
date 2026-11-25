import { useId, type SVGProps } from "react";

export function YarnIcon({ size = 20, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
 const id=useId();
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><defs><clipPath id={id}><circle cx="10" cy="10" r="7.3"/></clipPath></defs><circle cx="10" cy="10" r="7.3" fill="currentColor" fillOpacity=".06"/><g clipPath={"url(#"+id+")"}><path d="M2.3 9.6C6.7 5.7 11.9 4.9 16.9 7M2.8 12.8C7.4 8.4 12.5 7.4 17.5 9.7M4.7 15.8C8.8 11.8 13 10.7 17.2 12.2M7.7 2.7C5.5 4.7 4.7 6.8 4.8 8.3M11.3 2.5C9.1 3.5 7.9 4.7 7.4 6.2M8.6 17.4C11.1 15.6 13.6 14.6 16.3 14.8"/></g><path d="M17.2 10.8C21.9 10 17.1 17.4 20.1 19.4C21.8 20.6 23.4 18.8 21.8 17.7" stroke="currentColor"/></svg>;
}
