"use client";
import Image from "next/image";
import { cloneElement, useId, useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, MoveHorizontal, Puzzle, Plus, Minus, X } from "lucide-react";
import styles from "./SignInLayout.module.css";
import { ROOM_ACTIONS, type RoomAction } from "./house-actions";
import { YarnIcon } from "@/components/ui/YarnIcon";
import type { createHouseScene } from "./house-scene";

type House=ReturnType<typeof createHouseScene>;
function ControlTip({label,children}:{label:string;children:ReactElement<{"aria-describedby"?:string}>}){const id=useId();return <span className={styles.toolTipGroup}>{cloneElement(children,{"aria-describedby":id})}<span id={id} role="tooltip" className={styles.toolTip}>{label}</span></span>;}
export function AttentiveHouse(){
 const t=useTranslations("auth");const speech=useRef<(HTMLSpanElement|null)[]>([]);const [feeding,setFeeding]=useState(false);const [yarnBusy,setYarnBusy]=useState(false);const [yarnCat,setYarnCat]=useState<number|null>(null);const canvas=useRef<HTMLCanvasElement>(null);const house=useRef<House|null>(null);const [night,setNight]=useState(false);const [zoom,setZoom]=useState(53);const [ready,setReady]=useState(false);const [paused,setPaused]=useState(false);
 const roomMenu=useRef<HTMLDivElement>(null);const roomMenuButton=useRef<HTMLButtonElement>(null);const [roomOpen,setRoomOpen]=useState(false);const [activeAction,setActiveAction]=useState<RoomAction|null>(null);const [roomNotice,setRoomNotice]=useState("");const [roomStates,setRoomStates]=useState({lamp:false,aircon:false,curtains:true});
 useEffect(()=>{if(!roomOpen)return;const outside=(event:PointerEvent)=>{if(!roomMenu.current?.contains(event.target as Node))setRoomOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setRoomOpen(false);roomMenuButton.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[roomOpen]);
 useEffect(()=>{
  const desktop=matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)");const reduce=matchMedia("(prefers-reduced-motion: reduce)");let cancelCurrent=()=>{};
  const sync=()=>{cancelCurrent();house.current?.dispose();house.current=null;setReady(false);setPaused(false);setYarnBusy(false);setFeeding(false);setYarnCat(null);setRoomOpen(false);setRoomNotice("");setRoomStates({lamp:false,aircon:false,curtains:true});let cancelled=false;cancelCurrent=()=>{cancelled=true;};if(!desktop.matches||reduce.matches)return;
   void import("./house-scene").then(({createHouseScene})=>{if(cancelled||!canvas.current)return;try{house.current=createHouseScene(canvas.current,{speechElements:speech.current,words:{meow:t("catMeow"),purr:t("catPurr")},onRoomAction:(action,state)=>{if(cancelled)return;if((action==="lamp"||action==="aircon"||action==="curtains")&&state!==undefined)setRoomStates(previous=>({...previous,[action]:state}));setRoomNotice(state!==undefined?t(`roomToggleFeedback.${action}.${state?"on":"off"}`):t(`roomEffects.${action}`));},onFeedingState:(active)=>{if(!cancelled)setFeeding(active);},onYarnState:(active,index)=>{if(!cancelled){setYarnBusy(active);if(index!==undefined)setYarnCat(index);}}});setReady(true);}catch{house.current=null;setReady(false);}}).catch(()=>setReady(false));
  };sync();desktop.addEventListener("change",sync);reduce.addEventListener("change",sync);
  return()=>{cancelCurrent();desktop.removeEventListener("change",sync);reduce.removeEventListener("change",sync);house.current?.dispose();house.current=null;};
 },[t]);
 useEffect(()=>{const root=document.documentElement;const media=matchMedia('(prefers-color-scheme: dark)');const sync=()=>{const next=root.dataset.theme?root.dataset.theme==='dark':media.matches;setNight(next);house.current?.setNight(next);};const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});media.addEventListener('change',sync);sync();return()=>{observer.disconnect();media.removeEventListener('change',sync);};},[ready]);
 return <div className={styles.house} data-house-live={ready}>
  <div className={styles.scene}>
   <Image className={styles.poster} src={night?"/brand/attentive-house-night.png":"/brand/attentive-house-static.png"} width={1000} height={820} unoptimized alt={t("houseAlt")}/>
   {[0,1,2].map(i=><span key={i} className={styles.catBubble} ref={el=>{speech.current[i]=el;}} hidden aria-hidden="true"/>)}
   {ready&&<label className={styles.zoomRail}><Plus size={13} aria-hidden="true"/><input type="range" min="0" max="100" value={zoom} aria-label={t("houseZoom")} onChange={e=>{const value=Number(e.target.value);setZoom(value);house.current?.zoomTo(value);}}/><Minus size={13} aria-hidden="true"/></label>}
   <canvas ref={canvas} className={styles.canvas} aria-label={t("houseCanvasLabel")} aria-hidden={!ready}/>
  </div>
  {ready&&<><p className={styles.dragHint}><MoveHorizontal size={14} aria-hidden="true"/>{t("houseDrag")}</p><div className={styles.sceneControls} role="group" aria-label={t("houseControls")}>
   <ControlTip label={t("houseLeft")}><button type="button" aria-label={t("houseLeft")} onClick={()=>house.current?.rotate(-.2)}><ChevronLeft size={17}/></button></ControlTip>
   <ControlTip label={t("houseRight")}><button type="button" aria-label={t("houseRight")} onClick={()=>house.current?.rotate(.2)}><ChevronRight size={17}/></button></ControlTip>
   <ControlTip label={t("houseReset")}><button type="button" aria-label={t("houseReset")} onClick={()=>{house.current?.reset();setZoom(53);}}><RotateCcw size={15}/></button></ControlTip>
   <ControlTip label={t(paused?"housePlay":"housePause")}><button type="button" aria-label={t(paused?"housePlay":"housePause")} aria-pressed={paused} onClick={()=>{const next=!paused;setPaused(next);house.current?.setPaused(next);}}>{paused?<Play size={15}/>:<Pause size={15}/>}</button></ControlTip>
   <span className={styles.toolTipGroup}><button type="button" aria-label={t("giveYarn")} aria-describedby="house-yarn-tip" disabled={yarnBusy||night||feeding} aria-busy={yarnBusy} onClick={()=>{if(paused){setPaused(false);house.current?.setPaused(false);}house.current?.giveYarn();}}><YarnIcon size={20}/></button><span id="house-yarn-tip" role="tooltip" className={styles.toolTip}>{t(night?"catsSleeping":feeding?"catEating":"giveYarn")}</span></span>
   <div className={styles.roomMenuWrap} ref={roomMenu}><ControlTip label={t("roomMenu")}><button ref={roomMenuButton} type="button" aria-label={t("roomMenu")} aria-expanded={roomOpen} aria-controls="house-room-menu" onClick={()=>{setActiveAction(null);setRoomOpen(open=>!open);}}><Puzzle size={17}/></button></ControlTip>{roomOpen&&<div id="house-room-menu" role="group" aria-label={t("roomMenu")} className={styles.roomMenu}><header><p>{t("roomMenu")}</p><button type="button" aria-label={t("roomMenuClose")} onClick={()=>{setRoomOpen(false);roomMenuButton.current?.focus();}}><X size={14}/></button></header><div>{ROOM_ACTIONS.map((action:RoomAction)=><button type="button" key={action} disabled={action==="feed"&&feeding} aria-busy={action==="feed"&&feeding} data-active={activeAction===action} aria-pressed={action==="lamp"||action==="aircon"||action==="curtains"?roomStates[action]:undefined} onClick={()=>{setActiveAction(action);house.current?.interact(action);}}>{t(`roomActions.${action}`)}</button>)}</div><p className={styles.actionFeedback} aria-live="polite">{roomNotice||t("roomMenuHint")}</p></div>}</div>
  </div><p className={styles.roomStatus} role="status" aria-live="polite">{feeding?t("catEating"):roomNotice}</p><p className={styles.yarnStatus} role="status" aria-live="polite">{yarnBusy&&yarnCat!==null?t("yarnPlaying",{cat:t(["gingerCat","creamCat","greyCat"][yarnCat])}):""}</p></>}
 </div>;
}
