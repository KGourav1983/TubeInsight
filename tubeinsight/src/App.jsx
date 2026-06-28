import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Config ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// In dev, Pages Functions run on port 8788 via `wrangler pages dev`
// In production, they're on the same origin — no prefix needed
const API = import.meta.env.DEV ? "http://localhost:8788" : "";

// --- Helpers ---
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatNumber(n) {
  if (!n) return "0";
  const num = parseInt(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function generateReportId(videoId) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const random = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `${videoId}-${random}`;
}

function getReportIdFromUrl() {
  const match = window.location.pathname.match(/\/report\/([^/]+)/);
  return match ? match[1] : null;
}

// --- API calls via Pages Functions (keys stay server-side) ---
async function callAI(messages, model = "openai/gpt-4o-mini") {
  const res = await fetch(`${API}/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model })
  });
  const data = await res.json();
  console.log("AI response:", data);
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Empty response from AI");
  return text;
}

async function fetchYouTubeVideo(videoId, youtubeKey) {
  const res = await fetch(`${API}/youtube?videoId=${videoId}&youtubeKey=${encodeURIComponent(youtubeKey)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (!data.items?.length) throw new Error("Video not found");
  return data.items[0];
}

async function fetchYouTubeComments(videoId, youtubeKey) {
  const res = await fetch(`${API}/comments?videoId=${videoId}&youtubeKey=${encodeURIComponent(youtubeKey)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return (data.items || []).map(item =>
    item.snippet.topLevelComment.snippet.textDisplay
      .replace(/<[^>]+>/g, "").slice(0, 200)
  );
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response: " + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// --- UI Components ---
function ScoreRing({ score, size = 80 }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.22} fontWeight="700"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>
        {score}
      </text>
    </svg>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 100 }}>
      <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{ background: "#1e293b", color: "#f1f5f9", fontSize: 11, padding: "3px 10px", borderRadius: 20, display: "inline-block", margin: "2px 3px" }}>{children}</span>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 24, marginBottom: 16 }}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span>{title}
      </div>
      {children}
    </div>
  );
}

// --- Share Banner ---
function ShareBanner({ shareUrl }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{
      background: "linear-gradient(135deg, #052e16, #0c1a2e)",
      border: "1px solid #166534", borderRadius: 16,
      padding: "20px 24px", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap"
    }}>
      <div style={{ fontSize: 28 }}>🔗</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Report Saved — Shareable Link Ready
        </div>
        <div style={{
          background: "#020617", border: "1px solid #1e293b",
          borderRadius: 8, padding: "8px 12px",
          fontSize: 12, color: "#64748b", fontFamily: "monospace",
          wordBreak: "break-all"
        }}>
          {shareUrl}
        </div>
      </div>
      <button onClick={copy} style={{
        background: copied ? "#166534" : "linear-gradient(135deg, #22c55e, #16a34a)",
        border: "none", borderRadius: 10, color: "#fff",
        padding: "10px 20px", fontSize: 13, fontWeight: 700,
        cursor: "pointer", flexShrink: 0, transition: "background 0.3s"
      }}>
        {copied ? "✓ Copied!" : "Copy Link"}
      </button>
    </div>
  );
}

// --- Comment Sentiment Miner ---
function CommentMiner({ videoId, apiKey, savedAnalysis, onAnalysisDone, readOnly }) {
  const [analysis, setAnalysis] = useState(savedAnalysis || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeCluster, setActiveCluster] = useState(savedAnalysis ? 0 : null);

  async function mineComments() {
    setLoading(true);
    setError("");
    try {
      const comments = await fetchYouTubeComments(videoId, apiKey);
      if (!comments.length) throw new Error("No comments found on this video.");

      const prompt = `You are a YouTube audience analyst. Analyze these ${comments.length} comments and find patterns.

COMMENTS:
${comments.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "overallSentiment": "positive" | "mixed" | "negative",
  "sentimentScore": <0-100>,
  "summary": "2-3 sentence overview",
  "clusters": [
    {
      "theme": "Short theme (max 4 words)",
      "emoji": "one emoji",
      "percentage": <% of comments>,
      "sentiment": "positive" | "neutral" | "negative",
      "insight": "1-2 sentences",
      "exampleComments": ["paraphrased example 1", "paraphrased example 2"]
    }
  ],
  "creatorOpportunities": ["action 1", "action 2"],
  "mostRequestedContent": ["topic 1", "topic 2", "topic 3"],
  "commonPraise": ["praise 1", "praise 2"],
  "commonCriticism": ["complaint 1", "complaint 2"]
}
Identify 4-6 clusters. Paraphrase comments, never quote directly.`;

      const text = await callAI([{ role: "user", content: prompt }]);
      const result = parseJSON(text);
      setAnalysis(result);
      setActiveCluster(0);
      if (onAnalysisDone) onAnalysisDone(result);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const sc = s => s === "positive" ? "#22c55e" : s === "negative" ? "#ef4444" : "#f59e0b";
  const sb = s => s === "positive" ? "#052e16" : s === "negative" ? "#2d1515" : "#2d1f05";
  const sbr = s => s === "positive" ? "#166534" : s === "negative" ? "#7f1d1d" : "#854d0e";

  return (
    <Section title="Comment Sentiment Mining" icon="💬">
      {!analysis && !loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
              Fetches top 100 comments and clusters them into themes — revealing what viewers loved, complained about, and want to see next.
            </div>
            {readOnly ? (
              <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>Comment analysis not yet run for this report.</div>
            ) : (
              <button onClick={mineComments} style={{
                background: "linear-gradient(135deg, #0891b2, #6366f1)",
                border: "none", borderRadius: 10, color: "#fff",
                padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer"
              }}>💬 Mine Comments</button>
            )}
          </div>
        </div>
      )}
      {loading && <div style={{ color: "#6366f1", fontSize: 14 }}>⏳ Fetching and analyzing comments...</div>}
      {error && <div style={{ color: "#fca5a5", fontSize: 13, background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: 12 }}>{error}</div>}
      {analysis && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={analysis.sentimentScore} size={80} />
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Sentiment</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: sb(analysis.overallSentiment), border: `1px solid ${sbr(analysis.overallSentiment)}`, borderRadius: 20, padding: "4px 14px", marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc(analysis.overallSentiment) }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: sc(analysis.overallSentiment), textTransform: "capitalize" }}>{analysis.overallSentiment} audience</span>
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7 }}>{analysis.summary}</div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Comment Clusters</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {analysis.clusters.map((c, i) => (
                <button key={i} onClick={() => setActiveCluster(i)} style={{
                  background: activeCluster === i ? sb(c.sentiment) : "#1e293b",
                  border: `1px solid ${activeCluster === i ? sbr(c.sentiment) : "#334155"}`,
                  borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8
                }}>
                  <span style={{ fontSize: 16 }}>{c.emoji}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: activeCluster === i ? sc(c.sentiment) : "#94a3b8" }}>{c.theme}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{c.percentage}% of comments</div>
                  </div>
                </button>
              ))}
            </div>
            {activeCluster !== null && analysis.clusters[activeCluster] && (() => {
              const c = analysis.clusters[activeCluster];
              return (
                <div style={{ background: sb(c.sentiment), border: `1px solid ${sbr(c.sentiment)}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>{c.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: sc(c.sentiment) }}>{c.theme}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{c.percentage}% of comments · {c.sentiment}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, marginBottom: 14 }}>{c.insight}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Example comments</div>
                  {c.exampleComments.map((ex, j) => (
                    <div key={j} style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", marginBottom: 6, fontSize: 13, color: "#cbd5e1", fontStyle: "italic" }}>"{ex}"</div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>👏 WHAT THEY LOVED</div>
              {analysis.commonPraise.map((p, i) => <div key={i} style={{ color: "#86efac", fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>• {p}</div>)}
            </div>
            <div style={{ background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#fca5a5", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>😤 COMPLAINTS</div>
              {analysis.commonCriticism.map((c, i) => <div key={i} style={{ color: "#fca5a5", fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>• {c}</div>)}
            </div>
            <div style={{ background: "#0c1a2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>🙋 REQUESTS</div>
              {analysis.mostRequestedContent.map((r, i) => <div key={i} style={{ color: "#93c5fd", fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>• {r}</div>)}
            </div>
          </div>
          <div style={{ background: "linear-gradient(135deg, #1e1b4b, #1e1052)", border: "1px solid #312e81", borderRadius: 12, padding: 16 }}>
            <div style={{ color: "#818cf8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🚀 WHAT TO DO NEXT</div>
            {analysis.creatorOpportunities.map((opp, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: "#6366f1", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 1.6 }}>{opp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// --- Thumbnail Scorer ---
function ThumbnailScorer({ thumbnailUrl, videoTitle, savedAnalysis, onAnalysisDone, readOnly }) {
  const [thumbAnalysis, setThumbAnalysis] = useState(savedAnalysis || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyzeThumbnail() {
    setLoading(true);
    setError("");
    try {
      const prompt = `You are a YouTube thumbnail analyst. Analyze this thumbnail for "${videoTitle}".
Respond ONLY with valid JSON (no markdown, no backticks):
{
  "overallScore": <0-100>,
  "scores": { "contrast": <0-100>, "text": <0-100>, "faces": <0-100>, "emotion": <0-100>, "clarity": <0-100> },
  "scoreReasons": { "contrast": "one sentence", "text": "one sentence", "faces": "one sentence", "emotion": "one sentence", "clarity": "one sentence" },
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "improvements": ["fix 1", "fix 2", "fix 3"],
  "verdict": "One punchy sentence about the thumbnail"
}`;
      const text = await callAI([
        { role: "user", content: [
          { type: "image_url", image_url: { url: thumbnailUrl } },
          { type: "text", text: prompt }
        ]}
      ], "openai/gpt-4o");
      const analysis = parseJSON(text);
      setThumbAnalysis(analysis);
      if (onAnalysisDone) onAnalysisDone(analysis);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const scoreIcons = { contrast: "🎨", text: "🔤", faces: "😮", emotion: "⚡", clarity: "🔍" };
  const scoreLabels = { contrast: "Contrast", text: "Text", faces: "Faces", emotion: "Emotion", clarity: "Clarity" };

  return (
    <Section title="Thumbnail Scorer" icon="🖼️">
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img src={thumbnailUrl} alt="thumbnail" style={{ width: 200, borderRadius: 10, display: "block", border: "1px solid #1e293b" }} />
          {thumbAnalysis && (
            <div style={{
              position: "absolute", top: -10, right: -10,
              background: thumbAnalysis.overallScore >= 75 ? "#22c55e" : thumbAnalysis.overallScore >= 50 ? "#f59e0b" : "#ef4444",
              color: "#000", fontWeight: 800, fontSize: 16,
              width: 44, height: 44, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "3px solid #020617"
            }}>{thumbAnalysis.overallScore}</div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {!thumbAnalysis && !loading && (
            <div>
              <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
                Uses GPT-4o Vision to score your thumbnail on contrast, text, faces, emotion, and clarity.
              </div>
              {readOnly ? (
                <div style={{ color: "#475569", fontSize: 13, fontStyle: "italic" }}>Thumbnail analysis not yet run for this report.</div>
              ) : (
                <button onClick={analyzeThumbnail} style={{
                  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                  border: "none", borderRadius: 10, color: "#fff",
                  padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer"
                }}>🔍 Score This Thumbnail</button>
              )}
            </div>
          )}
          {loading && <div style={{ color: "#6366f1", fontSize: 14 }}>👁️ AI is analyzing your thumbnail...</div>}
          {error && <div style={{ color: "#fca5a5", fontSize: 13, background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: 12 }}>{error}</div>}
          {thumbAnalysis && (
            <div>
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 16, lineHeight: 1.6 }}>"{thumbAnalysis.verdict}"</div>
              <div style={{ display: "grid", gap: 10 }}>
                {Object.entries(thumbAnalysis.scores).map(([key, val]) => (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{scoreIcons[key]} {scoreLabels[key]}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: val >= 70 ? "#22c55e" : val >= 45 ? "#f59e0b" : "#ef4444" }}>{val}/100</span>
                    </div>
                    <div style={{ background: "#1e293b", borderRadius: 4, height: 6 }}>
                      <div style={{ height: 6, borderRadius: 4, width: `${val}%`, background: val >= 70 ? "#22c55e" : val >= 45 ? "#f59e0b" : "#ef4444", transition: "width 1s ease" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{thumbAnalysis.scoreReasons[key]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {thumbAnalysis && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 10, padding: 16 }}>
              <div style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>✓ STRENGTHS</div>
              {thumbAnalysis.strengths.map((s, i) => <div key={i} style={{ color: "#86efac", fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>• {s}</div>)}
            </div>
            <div style={{ background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 10, padding: 16 }}>
              <div style={{ color: "#fca5a5", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>✗ WEAKNESSES</div>
              {thumbAnalysis.weaknesses.map((w, i) => <div key={i} style={{ color: "#fca5a5", fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>• {w}</div>)}
            </div>
          </div>
          <div style={{ background: "#0c1a2e", border: "1px solid #1e3a5f", borderRadius: 10, padding: 16 }}>
            <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🛠 HOW TO IMPROVE IT</div>
            {thumbAnalysis.improvements.map((imp, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ color: "#93c5fd", fontSize: 13, lineHeight: 1.5 }}>{imp}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

// --- Report View ---
function ReportView({ result, shareUrl, apiKey, readOnly, onUpdateReport }) {
  const v = result.video;
  const a = result.analysis;

  async function updateReportField(field, value) {
    if (!result.reportId) return;
    await supabase.from("reports").update({ [field]: value }).eq("id", result.reportId);
    if (onUpdateReport) onUpdateReport(field, value);
  }

  return (
    <div>
      {shareUrl && <ShareBanner shareUrl={shareUrl} />}

      {readOnly && (
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>👁️</span>
          <span style={{ fontSize: 13, color: "#64748b" }}>This is a shared report — view only. <a href="/" style={{ color: "#6366f1" }}>Analyze your own video →</a></span>
        </div>
      )}

      {/* Video Info */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, padding: 24, marginBottom: 16, display: "flex", gap: 16, alignItems: "flex-start" }}>
        {v.snippet.thumbnails?.medium?.url && (
          <img src={v.snippet.thumbnails.medium.url} alt="thumbnail" style={{ width: 140, borderRadius: 10, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>{v.snippet.title}</div>
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
            {v.snippet.channelTitle} · {new Date(v.snippet.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatCard label="Views" value={formatNumber(v.statistics.viewCount)} />
            <StatCard label="Likes" value={formatNumber(v.statistics.likeCount)} />
            <StatCard label="Comments" value={formatNumber(v.statistics.commentCount)} />
          </div>
        </div>
      </div>

      {/* Key Insight */}
      <div style={{ background: "linear-gradient(135deg, #1e1b4b, #1e1052)", border: "1px solid #312e81", borderRadius: 16, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 28 }}>💡</div>
        <div>
          <div style={{ fontSize: 11, color: "#818cf8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Key Insight</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e0e7ff" }}>{a.keyInsight}</div>
        </div>
      </div>

      {/* Scores */}
      <Section title="Performance Scores" icon="📊">
        <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <ScoreRing score={a.overallScore} size={90} />
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Overall</div>
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {Object.entries(a.scores).map(([key, val]) => (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>{key}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: val >= 70 ? "#22c55e" : val >= 45 ? "#f59e0b" : "#ef4444" }}>{val}</span>
                </div>
                <div style={{ background: "#1e293b", borderRadius: 4, height: 6 }}>
                  <div style={{ height: 6, borderRadius: 4, width: `${val}%`, background: val >= 70 ? "#22c55e" : val >= 45 ? "#f59e0b" : "#ef4444", transition: "width 1s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Thumbnail Scorer */}
      {v.snippet.thumbnails?.high?.url && (
        <ThumbnailScorer
          thumbnailUrl={v.snippet.thumbnails.high.url}
          videoTitle={v.snippet.title}
          savedAnalysis={result.thumb_analysis}
          readOnly={readOnly}
          onAnalysisDone={val => updateReportField("thumb_analysis", val)}
        />
      )}

      {/* Comment Miner */}
      <CommentMiner
        videoId={v.id}
        apiKey={apiKey}
        savedAnalysis={result.comment_analysis}
        readOnly={readOnly}
        onAnalysisDone={val => updateReportField("comment_analysis", val)}
      />

      {/* What Worked */}
      <Section title="What Worked" icon="✅">
        {a.whatWorked.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < a.whatWorked.length - 1 ? 16 : 0, paddingBottom: i < a.whatWorked.length - 1 ? 16 : 0, borderBottom: i < a.whatWorked.length - 1 ? "1px solid #1e293b" : "none" }}>
            <div style={{ width: 28, height: 28, background: "#052e16", border: "1px solid #166534", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>✓</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#4ade80", marginBottom: 4 }}>{w.point}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{w.detail}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* What to Improve */}
      <Section title="What to Improve" icon="🔧">
        {a.whatToImprove.map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < a.whatToImprove.length - 1 ? 16 : 0, paddingBottom: i < a.whatToImprove.length - 1 ? 16 : 0, borderBottom: i < a.whatToImprove.length - 1 ? "1px solid #1e293b" : "none" }}>
            <div style={{ width: 28, height: 28, background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>!</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#fca5a5", marginBottom: 4 }}>{w.point}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{w.detail}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* Title Alternatives */}
      <Section title="Better Title Options" icon="✏️">
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          Original: <span style={{ color: "#94a3b8" }}>"{v.snippet.title}"</span>
        </div>
        {a.titleAlternatives.map((t, i) => (
          <div key={i} style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#e2e8f0" }}>{t}</span>
            <button onClick={() => navigator.clipboard.writeText(t)}
              style={{ background: "#1e293b", border: "none", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Copy</button>
          </div>
        ))}
      </Section>

      {/* Tags */}
      <Section title="Suggested Tags" icon="🏷️">
        <div>{a.tagSuggestions.map((t, i) => <Tag key={i}>{t}</Tag>)}</div>
      </Section>

      {/* Description */}
      <Section title="Improved Description Opening" icon="📝">
        <div style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: 16, fontSize: 14, color: "#94a3b8", lineHeight: 1.7, position: "relative" }}>
          {a.improvedDescription}
          <button onClick={() => navigator.clipboard.writeText(a.improvedDescription)}
            style={{ position: "absolute", top: 12, right: 12, background: "#1e293b", border: "none", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Copy</button>
        </div>
      </Section>

      {/* Timing */}
      <Section title="Upload Timing" icon="🕐">
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7 }}>{a.uploadTimingNote}</div>
      </Section>
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const reportId = getReportIdFromUrl();
    if (reportId) {
      loadReport(reportId);
    } else {
      setPageLoading(false);
    }
  }, []);

  async function loadReport(reportId) {
    setPageLoading(true);
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (error || !data) throw new Error("Report not found.");

      setResult({
        reportId: data.id,
        video: data.video_data,
        analysis: data.analysis,
        thumb_analysis: data.thumb_analysis,
        comment_analysis: data.comment_analysis,
        readOnly: true
      });
      setShareUrl(window.location.href);
    } catch (e) {
      setError("Report not found or has been deleted.");
    }
    setPageLoading(false);
  }

  async function saveReport(videoData, analysis) {
    const reportId = generateReportId(videoData.id);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        id: reportId,
        video_id: videoData.id,
        video_url: url,
        video_data: videoData,
        analysis: analysis,
      })
      .select("id")
      .single();

    if (error) throw new Error("Failed to save report: " + error.message);
    return data.id;
  }

  async function analyzeVideo(videoData) {
    const { snippet, statistics, contentDetails } = videoData;
    const engagementRate = statistics.viewCount > 0
      ? (((parseInt(statistics.likeCount || 0) + parseInt(statistics.commentCount || 0)) / parseInt(statistics.viewCount)) * 100).toFixed(2)
      : 0;

    const prompt = `You are an expert YouTube content strategist. Analyze this video and respond ONLY with valid JSON (no markdown, no backticks):

Title: ${snippet.title}
Channel: ${snippet.channelTitle}
Description: ${snippet.description?.slice(0, 500)}
Tags: ${snippet.tags?.join(", ") || "none"}
Published: ${snippet.publishedAt}
Duration: ${contentDetails.duration}
Views: ${statistics.viewCount}
Likes: ${statistics.likeCount || 0}
Comments: ${statistics.commentCount || 0}
Engagement Rate: ${engagementRate}%

{
  "overallScore": <0-100>,
  "scores": { "title": <0-100>, "seo": <0-100>, "engagement": <0-100>, "description": <0-100>, "timing": <0-100> },
  "whatWorked": [{"point": "headline", "detail": "2 sentence explanation"}],
  "whatToImprove": [{"point": "headline", "detail": "2 sentence explanation with fix"}],
  "titleAlternatives": ["title 1", "title 2", "title 3"],
  "improvedDescription": "Rewritten description opening (150 chars)",
  "tagSuggestions": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "keyInsight": "One punchy sentence about the biggest performance factor",
  "uploadTimingNote": "Assessment of publish timing"
}`;

    const text = await callAI([{ role: "user", content: prompt }]);
    return parseJSON(text);
  }

  async function handleAnalyze() {
    setError("");
    setResult(null);
    setShareUrl("");
    const videoId = extractVideoId(url);
    if (!videoId) { setError("Couldn't find a video ID in that URL."); return; }
    if (!apiKey) { setError("Please enter your YouTube Data API key."); return; }

    setLoading(true);
    try {
      setStep("Fetching video data from YouTube...");
      const videoData = await fetchYouTubeVideo(videoId, apiKey);

      setStep("Running AI analysis...");
      const analysis = await analyzeVideo(videoData);

      setStep("Saving report...");
      const reportId = await saveReport(videoData, analysis);
      const newUrl = `${window.location.origin}/report/${reportId}`;
      window.history.pushState({}, "", `/report/${reportId}`);

      setShareUrl(newUrl);
      setResult({ reportId, video: videoData, analysis, readOnly: false });
    } catch (e) {
      console.error(e);
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
    setStep("");
  }

  function handleUpdateReport(field, value) {
    setResult(prev => ({ ...prev, [field]: value }));
  }

  if (pageLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#020617", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", color: "#64748b", fontSize: 14 }}>
        ⏳ Loading report...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#020617", fontFamily: "'Inter', system-ui, sans-serif", color: "#f8fafc", padding: "0 0 60px" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #0f172a", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>TubeInsight</div>
            <div style={{ fontSize: 11, color: "#475569" }}>AI-powered video analytics</div>
          </div>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {result && !result.readOnly && shareUrl && (
            <button onClick={() => navigator.clipboard.writeText(shareUrl)}
              style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>
              🔗 Copy report link
            </button>
          )}
          <div style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>BETA</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 0" }}>
        {!result && (
          <>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 13, color: "#6366f1", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>For YouTube Creators</div>
              <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.15, margin: "0 0 14px", background: "linear-gradient(135deg, #f8fafc, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Why did your video perform<br />the way it did?
              </h1>
              <p style={{ color: "#64748b", fontSize: 16, maxWidth: 460, margin: "0 auto" }}>
                Paste any YouTube URL. Get an AI breakdown — with a shareable report link you can send to your team.
              </p>
            </div>

            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 20, padding: 28, marginBottom: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>YouTube Video URL</label>
                <input value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>
                  YouTube Data API Key
                  <span onClick={() => setShowApiKey(!showApiKey)} style={{ color: "#6366f1", cursor: "pointer", marginLeft: 8 }}>{showApiKey ? "hide" : "show"}</span>
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}>Get one free →</a>
                </label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                  type={showApiKey ? "text" : "password"} placeholder="AIza..."
                  style={{ width: "100%", background: "#020617", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>Never stored. Enable "YouTube Data API v3" in Google Cloud Console.</div>
              </div>
              {error && (
                <div style={{ background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{error}</div>
              )}
              <button onClick={handleAnalyze} disabled={loading || !url}
                style={{ width: "100%", padding: "14px", background: loading ? "#1e293b" : "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? `⏳ ${step}` : "✦ Analyze Video"}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <ReportView
              result={result}
              shareUrl={shareUrl}
              apiKey={apiKey}
              readOnly={result.readOnly}
              onUpdateReport={handleUpdateReport}
            />
            {!result.readOnly && (
              <button onClick={() => { setResult(null); setUrl(""); setError(""); setShareUrl(""); window.history.pushState({}, "", "/"); }}
                style={{ width: "100%", padding: 14, background: "transparent", border: "1px solid #1e293b", borderRadius: 12, color: "#64748b", fontSize: 14, cursor: "pointer", marginTop: 8 }}>
                ← Analyze another video
              </button>
            )}
          </>
        )}

        {!result && (
          <div style={{ textAlign: "center", marginTop: 40, color: "#1e293b", fontSize: 12 }}>
            Uses YouTube Data API v3 · GPT-4o Vision · Reports saved to Supabase
          </div>
        )}
      </div>
    </div>
  );
}
