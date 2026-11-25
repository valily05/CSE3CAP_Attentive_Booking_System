import type { SVGProps } from "react";

/** Recognisable WhatsApp phone-and-chat mark in the current text colour. */
export function WhatsAppIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.8a8.5 8.5 0 1 1 16.2-4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8.1 6.8c-.3 0-.8.2-1 .6-.5.7-.5 1.6-.1 2.7 1 2.7 3.3 5 6.1 6 .9.3 1.9.2 2.6-.3.4-.3.6-.9.6-1.3 0-.2-.1-.3-.3-.4l-2.1-1c-.2-.1-.4-.1-.5.1l-.8 1c-.1.1-.3.2-.5.1-1.3-.5-2.6-1.7-3.3-3-.1-.2-.1-.4 0-.5l.7-.8c.2-.2.2-.4.1-.6l-.9-2.2c-.1-.3-.3-.4-.6-.4Z" fill="currentColor"/></svg>;
}
