export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const videoId = searchParams.get("videoId");
  const youtubeKey = searchParams.get("youtubeKey");

  if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });
  if (!youtubeKey) return Response.json({ error: "youtubeKey required" }, { status: 400 });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${youtubeKey}`
  );
  const data = await res.json();
  return Response.json(data);
}