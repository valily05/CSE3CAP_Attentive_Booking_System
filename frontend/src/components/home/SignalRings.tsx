import type { CSSProperties } from "react";
import styles from "./SignalRings.module.css";

const RINGS = Array.from({length:12},(_,index)=>index);

export function SignalRings() {
 return <svg className={styles.signal} viewBox="0 0 640 640" aria-hidden="true" focusable="false">
  {RINGS.map(index=><circle key={index} className={styles.ring} cx="320" cy="320" r="300" fill="none" vectorEffect="non-scaling-stroke" style={{animationDelay:`-${index}s`,"--rest-scale":(index+1)/12} as CSSProperties}/>)}
 </svg>;
}
