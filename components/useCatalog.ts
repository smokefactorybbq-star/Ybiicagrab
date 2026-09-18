"use client";
import {useCallback,useEffect,useState} from "react";
import type {PickupPoint} from "../data/pickupPoints";
export function useCatalog(){
 const [points,setPoints]=useState<PickupPoint[]>([]),[discounts,setDiscounts]=useState<Record<string,number>>({}),[ready,setReady]=useState(false),[error,setError]=useState("");
 const reload=useCallback(async()=>{try{const r=await fetch("/api/catalog",{cache:"no-store"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Не удалось загрузить данные");setPoints(d.points);setDiscounts(d.discounts);setReady(true);setError("");return d;}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить данные");setReady(false);return null;}},[]);
 useEffect(()=>{void reload();const timer=setInterval(()=>void reload(),30000);const refresh=()=>void reload();window.addEventListener("mealpoint-catalog-updated",refresh);return()=>{clearInterval(timer);window.removeEventListener("mealpoint-catalog-updated",refresh);};},[reload]);
 return {points,discounts,ready,error,reload};
}
