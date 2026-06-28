export async function onRequest(context) {
  const body = await context.request.json();

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${context.env.OPENROUTER_KEY}`,
      "HTTP-Referer": "https://tubeinsight.pages.dev",
      "X-Title": "TubeInsight"
    },
    body: JSON.stringify({
      model: body.model || "openai/gpt-4o-mini",
      max_tokens: 1500,
      messages: body.messages
    })
  });
  const data = await res.json();
  return Response.json(data);
}