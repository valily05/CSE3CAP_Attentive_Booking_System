"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import styles from "./UrgentHow.module.css";
const Progress=createContext(0);
export function PreviewTyping({length,children}:{length:number;children:ReactNode}){
 const[count,setCount]=useState(0);
 useEffect(()=>{const motion=matchMedia("(prefers-reduced-motion: reduce)");let timer:ReturnType<typeof setTimeout>;const start=()=>{clearTimeout(timer);let index=0;const tick=()=>{setCount(motion.matches?length:index);if(motion.matches)return;const complete=index===length;index=complete?0:index+1;timer=setTimeout(tick,complete?4500:index===1?700:110)};tick()};start();motion.addEventListener("change",start);return()=>{clearTimeout(timer);motion.removeEventListener("change",start)}},[length]);
 return <Progress.Provider value={count}>{children}</Progress.Provider>
}
export function PreviewName({value}:{value:string}){const count=useContext(Progress);return <span>{value.slice(0,count)}<i className={styles.typingCaret}/></span>}
