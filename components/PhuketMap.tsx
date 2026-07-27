const points = [
  { name: "Meal Point · Chalong", top: "66%", left: "55%" },
  { name: "Meal Point · Rawai", top: "82%", left: "51%" },
  { name: "Meal Point · Phuket Town", top: "49%", left: "51%" },
  { name: "Meal Point · Patong", top: "45%", left: "34%" },
  { name: "Meal Point · Bang Tao", top: "22%", left: "40%" }
];

export default function PhuketMap() {
  return (
    <section className="map-section">
      <div className="section-heading split-heading">
        <div>
          <span className="eyebrow">Пункты выдачи</span>
          <h2>Найдите ближайший Meal Point</h2>
          <p>Красные точки показывают доступные места получения подписки на Пхукете.</p>
        </div>
        <span className="map-status"><i /> 5 точек открыто</span>
      </div>

      <div className="map-shell">
        <iframe
          title="Карта Пхукета"
          src="https://www.openstreetmap.org/export/embed.html?bbox=98.2507%2C7.7330%2C98.4745%2C8.1912&layer=mapnik"
          loading="lazy"
        />
        <div className="map-point-layer" aria-label="Пункты Meal Point">
          {points.map((point, index) => (
            <button
              type="button"
              key={point.name}
              className="map-point"
              style={{ top: point.top, left: point.left }}
              title={point.name}
              aria-label={point.name}
            >
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="point-list">
        {points.map((point, index) => (
          <div key={point.name}><b>{index + 1}</b><span>{point.name}</span><small>Ежедневно 11:00–21:00</small></div>
        ))}
      </div>
    </section>
  );
}

