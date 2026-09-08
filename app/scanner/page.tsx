import Link from "next/link";
export default function ScannerDisabledPage(){
  return <main className="page-shell"><section className="manager-login"><span className="eyebrow">MealPoint</span><h1>QR-сканер отключён</h1><p>Дни подписки больше не списываются QR-кодом. Если день не поставлен на паузу, он автоматически списывается после 18:00 по времени Пхукета.</p><Link className="manager-scanner-link" href="/manager">Вернуться к менеджеру</Link></section></main>;
}
