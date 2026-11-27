"use client";
import {createContext,useContext} from "react";
export type Branch=string;
export const AdminBranchNameContext=createContext("");
export const useAdminBranchName=()=>useContext(AdminBranchNameContext);
export const AdminBranchContext=createContext<Branch>("all");
export const useAdminBranch=()=>useContext(AdminBranchContext);
export const branchLocation=(branch:Branch)=>branch==="all"?"":branch;
export function adminHref(path:string,branch:Branch){return path+(branch==="all"?"":"?branch="+branch)}
