import { useState } from "react";

//const CLAUDE_MODEL = "claude-sonnet-4-6";

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

function ScoreRing({ score, size = 80 }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.22} fontWeight="700"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {score}
      </text>
    </svg>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 120
    }}>
      <div style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Tag({ children, color = "#334155" }) {
  return (
    <span style={{
      background: color, color: "#f1f5f9", fontSize: 11,
      padding: "3px 10px", borderRadius: 20, display: "inline-block", margin: "2px 3px"
    }}>{children}</span>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 16, padding: 24, marginBottom: 16
    }}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span>{title}
      </div>
      {children}
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  async function fetchYouTubeData(videoId) {
    if (!apiKey) throw new Error("YouTube API key required");
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error("Video not found");
    return data.items[0];
  }

  async function analyzeWithClaude(videoData) {
    const { snippet, statistics, contentDetails } = videoData;
    const engagementRate = statistics.viewCount > 0
      ? (((parseInt(statistics.likeCount || 0) + parseInt(statistics.commentCount || 0)) / parseInt(statistics.viewCount)) * 100).toFixed(2)
      : 0;

    const prompt = `You are an expert YouTube content strategist analyzing a video. Give detailed, actionable insights.

VIDEO DATA:
Title: ${snippet.title}
Channel: ${snippet.channelTitle}
Description (first 500 chars): ${snippet.description?.slice(0, 500)}
Tags: ${snippet.tags?.join(", ") || "none"}
Category: ${snippet.categoryId}
Published: ${snippet.publishedAt}
Duration: ${contentDetails.duration}
Views: ${statistics.viewCount}
Likes: ${statistics.likeCount || 0}
Comments: ${statistics.commentCount || 0}
Engagement Rate: ${engagementRate}%
Thumbnail URL: ${snippet.thumbnails?.high?.url}

Analyze this video and respond ONLY with valid JSON (no markdown, no backticks) in this exact structure:
{
  "overallScore": <number 0-100>,
  "scores": {
    "title": <number 0-100>,
    "seo": <number 0-100>,
    "engagement": <number 0-100>,
    "description": <number 0-100>,
    "timing": <number 0-100>
  },
  "whatWorked": [
    {"point": "short headline", "detail": "2 sentence explanation with data"}
  ],
  "whatToImprove": [
    {"point": "short headline", "detail": "2 sentence explanation with specific fix"}
  ],
  "titleAlternatives": ["alt title 1", "alt title 2", "alt title 3"],
  "improvedDescription": "A rewritten description opening (first 150 chars) with better hooks and keywords",
  "tagSuggestions": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "keyInsight": "One punchy sentence: the single biggest reason this video did or didn't perform well",
  "uploadTimingNote": "Assessment of whether publish day/time was good or bad based on the date"
}`;

    const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "TubeInsight"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    console.log("OpenRouter response:", data);

    if (data.error) throw new Error(data.error.message);

    const text = data.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Empty response from AI");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response: " + text.slice(0, 200));

    return JSON.parse(jsonMatch[0]);
    
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  }

  async function handleAnalyze() {
    setError("");
    setResult(null);
    const videoId = extractVideoId(url);
    if (!videoId) { setError("Couldn't find a video ID in that URL. Try a standard YouTube link."); return; }
    if (!apiKey) { setError("Please enter your YouTube Data API key."); return; }

    setLoading(true);
    try {
      setStep("Fetching video data from YouTube...");
      const videoData = await fetchYouTubeData(videoId);

      setStep("Running AI analysis...");
      const analysis = await analyzeWithClaude(videoData);

      setResult({ video: videoData, analysis });
    } catch (e) {
      setError(e.message || "Something went wrong. Check your API key and try again.");
    }
    setLoading(false);
    setStep("");
  }

  const v = result?.video;
  const a = result?.analysis;

  return (
    <div style={{
      minHeight: "100vh", background: "#020617",
      fontFamily: "'Inter', system-ui, sans-serif", color: "#f8fafc",
      padding: "0 0 60px"
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #0f172a", padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            borderRadius: 10, width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
          }}>▶</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>TubeInsight</div>
            <div style={{ fontSize: 11, color: "#475569" }}>AI-powered video analytics</div>
          </div>
        </div>
        <div style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          fontSize: 11, padding: "4px 12px", borderRadius: 20, fontWeight: 600
        }}>BETA</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 0" }}>

        {/* Hero */}
        {!result && (
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 13, color: "#6366f1", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              For YouTube Creators
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.15, margin: "0 0 14px", background: "linear-gradient(135deg, #f8fafc, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Why did your video perform<br />the way it did?
            </h1>
            <p style={{ color: "#64748b", fontSize: 16, maxWidth: 460, margin: "0 auto" }}>
              Paste any YouTube URL. Get an AI breakdown of what worked, what didn't, and exactly how to fix it.
            </p>
          </div>
        )}

        {/* Input Card */}
        <div style={{
          background: "#0f172a", border: "1px solid #1e293b",
          borderRadius: 20, padding: 28, marginBottom: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>YouTube Video URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
              style={{
                width: "100%", background: "#020617", border: "1px solid #1e293b",
                borderRadius: 10, padding: "12px 16px", color: "#f8fafc",
                fontSize: 14, outline: "none", boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>
              YouTube Data API Key
              <span
                onClick={() => setShowApiKey(!showApiKey)}
                style={{ color: "#6366f1", cursor: "pointer", marginLeft: 8 }}
              >
                {showApiKey ? "hide" : "show"}
              </span>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}
              >Get one free →</a>
            </label>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              type={showApiKey ? "text" : "password"}
              placeholder="AIza..."
              style={{
                width: "100%", background: "#020617", border: "1px solid #1e293b",
                borderRadius: 10, padding: "12px 16px", color: "#f8fafc",
                fontSize: 14, outline: "none", boxSizing: "border-box"
              }}
            />
            <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>
              Your key is never stored. Enable "YouTube Data API v3" in Google Cloud Console.
            </div>
          </div>

          {error && (
            <div style={{
              background: "#1c0a0a", border: "1px solid #7f1d1d",
              borderRadius: 10, padding: "12px 16px", color: "#fca5a5",
              fontSize: 13, marginBottom: 16
            }}>{error}</div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading || !url}
            style={{
              width: "100%", padding: "14px",
              background: loading ? "#1e293b" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", borderRadius: 12, color: "#fff",
              fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s"
            }}
          >
            {loading ? `⏳ ${step}` : "✦ Analyze Video"}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div>
            {/* Video Info */}
            <div style={{
              background: "#0f172a", border: "1px solid #1e293b",
              borderRadius: 16, padding: 24, marginBottom: 16,
              display: "flex", gap: 16, alignItems: "flex-start"
            }}>
              {v.snippet.thumbnails?.medium?.url && (
                <img src={v.snippet.thumbnails.medium.url} alt="thumbnail"
                  style={{ width: 140, borderRadius: 10, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>
                  {v.snippet.title}
                </div>
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
            <div style={{
              background: "linear-gradient(135deg, #1e1b4b, #1e1052)",
              border: "1px solid #312e81", borderRadius: 16,
              padding: "20px 24px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 16
            }}>
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
                        <div style={{
                          height: 6, borderRadius: 4,
                          width: `${val}%`,
                          background: val >= 70 ? "#22c55e" : val >= 45 ? "#f59e0b" : "#ef4444",
                          transition: "width 1s ease"
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* What Worked */}
            <Section title="What Worked" icon="✅">
              {a.whatWorked.map((w, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, marginBottom: i < a.whatWorked.length - 1 ? 16 : 0,
                  paddingBottom: i < a.whatWorked.length - 1 ? 16 : 0,
                  borderBottom: i < a.whatWorked.length - 1 ? "1px solid #1e293b" : "none"
                }}>
                  <div style={{
                    width: 28, height: 28, background: "#052e16", border: "1px solid #166534",
                    borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, flexShrink: 0
                  }}>✓</div>
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
                <div key={i} style={{
                  display: "flex", gap: 12, marginBottom: i < a.whatToImprove.length - 1 ? 16 : 0,
                  paddingBottom: i < a.whatToImprove.length - 1 ? 16 : 0,
                  borderBottom: i < a.whatToImprove.length - 1 ? "1px solid #1e293b" : "none"
                }}>
                  <div style={{
                    width: 28, height: 28, background: "#2d1515", border: "1px solid #7f1d1d",
                    borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, flexShrink: 0
                  }}>!</div>
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
                <div key={i} style={{
                  background: "#020617", border: "1px solid #1e293b",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 8,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <span style={{ fontSize: 14, color: "#e2e8f0" }}>{t}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(t)}
                    style={{
                      background: "#1e293b", border: "none", borderRadius: 6,
                      color: "#94a3b8", fontSize: 11, padding: "4px 10px", cursor: "pointer"
                    }}
                  >Copy</button>
                </div>
              ))}
            </Section>

            {/* Tags */}
            <Section title="Suggested Tags" icon="🏷️">
              <div>
                {a.tagSuggestions.map((t, i) => (
                  <Tag key={i} color="#1e293b">{t}</Tag>
                ))}
              </div>
            </Section>

            {/* Description */}
            <Section title="Improved Description Opening" icon="📝">
              <div style={{
                background: "#020617", border: "1px solid #1e293b",
                borderRadius: 10, padding: 16, fontSize: 14, color: "#94a3b8",
                lineHeight: 1.7, position: "relative"
              }}>
                {a.improvedDescription}
                <button
                  onClick={() => navigator.clipboard.writeText(a.improvedDescription)}
                  style={{
                    position: "absolute", top: 12, right: 12,
                    background: "#1e293b", border: "none", borderRadius: 6,
                    color: "#94a3b8", fontSize: 11, padding: "4px 10px", cursor: "pointer"
                  }}
                >Copy</button>
              </div>
            </Section>

            {/* Timing */}
            <Section title="Upload Timing" icon="🕐">
              <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7 }}>{a.uploadTimingNote}</div>
            </Section>

            {/* Analyze another */}
            <button
              onClick={() => { setResult(null); setUrl(""); setError(""); }}
              style={{
                width: "100%", padding: 14, background: "transparent",
                border: "1px solid #1e293b", borderRadius: 12, color: "#64748b",
                fontSize: 14, cursor: "pointer", marginTop: 8
              }}
            >
              ← Analyze another video
            </button>
          </div>
        )}

        {/* Footer */}
        {!result && (
          <div style={{ textAlign: "center", marginTop: 40, color: "#1e293b", fontSize: 12 }}>
            Uses YouTube Data API v3 · Powered by Claude AI · Your data is never stored
          </div>
        )}
      </div>
    </div>
  );
}
