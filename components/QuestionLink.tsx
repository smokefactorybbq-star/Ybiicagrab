export default function QuestionLink({ className = "question-link" }: { className?: string }) {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || "SmokefactoryBBQ").replace(/^@/, "");
  return (
    <a className={className} href={`https://t.me/${username}`} target="_blank" rel="noreferrer">
      Задать вопрос
    </a>
  );
}
