const managerTelegramUrl = process.env.NEXT_PUBLIC_MANAGER_TELEGRAM_URL || "https://t.me/SmokefactoryBBQ";

export default function QuestionLink({ className = "question-link" }: { className?: string }) {
  return (
    <a className={className} href={managerTelegramUrl} target="_blank" rel="noreferrer">
      Задать вопрос
    </a>
  );
}
