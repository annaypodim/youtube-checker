export default async function ClipPage({ params, searchParams }) {
  const { id } = await params;
  const { start, end } = await searchParams;

  let embedUrl = "https://www.youtube-nocookie.com/embed/" + id;
  const query = new URLSearchParams();
  if (start) query.set("start", start);
  if (end) query.set("end", end);
  const queryString = query.toString();
  if (queryString) {
    embedUrl += "?" + queryString;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        zIndex: 9999,
      }}
    >
      <iframe width="100%" height="100%" 
        src={embedUrl} 
        frameBorder="0" 
        allowFullScreen
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      >
      </iframe>
    </div>
  );
}
