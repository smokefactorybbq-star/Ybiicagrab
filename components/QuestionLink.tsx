const managerTelegramUrl = process.env.NEXT_PUBLIC_MANAGER_TELEGRAM_URL || "https://t.me/mealpoint_phuket";

export default function QuestionLink({ className = "question-link" }: { className?: string }) {
  return (
    <a className={className} href={managerTelegramUrl} target="_blank" rel="noreferrer">
      Задать вопрос
    </a>
  );
}
