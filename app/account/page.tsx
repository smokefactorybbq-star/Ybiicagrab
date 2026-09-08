"use client";

import { useEffect } from "react";

export default function AccountPage() {
  useEffect(() => {
    window.location.replace("/shop.html?account=1");
  }, []);
  return <main style={{padding:24,fontFamily:"system-ui"}}>Открываю личный кабинет Smoke Factory BBQ…</main>;
}
