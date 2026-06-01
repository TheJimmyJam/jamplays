// TMDB proxy — keeps the API token server-side.
// Token is read from the Netlify env var TMDB_READ_TOKEN.
const IMG = "https://image.tmdb.org/t/p";

const TOKEN = process.env.TMDB_READ_TOKEN;

async function tmdb(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json;charset=utf-8",
    },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const poster = (p) => (p ? `${IMG}/w500${p}` : null);
const backdrop = (p) => (p ? `${IMG}/w1280${p}` : null);
const year = (d) => (d ? String(d).slice(0, 4) : "");

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (!TOKEN) return json({ error: "TMDB token not configured" }, 500);
  const q = event.queryStringParameters || {};
  const action = q.action || "search";

  try {
    if (action === "search") {
      const query = (q.query || "").trim();
      if (!query) return json({ results: [] });
      const data = await tmdb(
        `/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`
      );
      const results = (data.results || [])
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .map((r) => ({
          tmdb_id: r.id,
          media_type: r.media_type,
          title: r.title || r.name,
          year: year(r.release_date || r.first_air_date),
          poster_url: poster(r.poster_path),
          rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
          popularity: r.popularity || 0,
          overview: r.overview || "",
        }));
      return json({ results });
    }

    if (action === "details") {
      const id = q.id;
      const type = q.type === "tv" ? "tv" : "movie";
      if (!id) return json({ error: "missing id" }, 400);
      const d = await tmdb(
        `/${type}/${id}?append_to_response=credits&language=en-US`
      );
      const crew = (d.credits && d.credits.crew) || [];
      const cast = (d.credits && d.credits.cast) || [];

      let director;
      if (type === "movie") {
        director = crew
          .filter((c) => c.job === "Director")
          .map((c) => c.name)
          .join(", ");
      } else {
        director =
          (d.created_by || []).map((c) => c.name).join(", ") ||
          crew
            .filter((c) => c.job === "Executive Producer")
            .slice(0, 2)
            .map((c) => c.name)
            .join(", ");
      }

      const date = d.release_date || d.first_air_date || "";
      let runtime = "";
      if (type === "movie" && d.runtime) {
        runtime = `${d.runtime} min`;
      } else if (type === "tv") {
        const ep = (d.episode_run_time && d.episode_run_time[0]) || null;
        const seasons = d.number_of_seasons
          ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? "s" : ""}`
          : "";
        runtime = [seasons, ep ? `${ep} min/ep` : ""].filter(Boolean).join(" · ");
      }

      return json({
        tmdb_id: d.id,
        media_type: type,
        title: d.title || d.name,
        year: year(date),
        release_date: date,
        poster_url: poster(d.poster_path),
        backdrop_url: backdrop(d.backdrop_path),
        overview: d.overview || "",
        director: director || "—",
        top_cast: cast.slice(0, 5).map((c) => c.name).join(", "),
        genres: (d.genres || []).map((g) => g.name).join(", "),
        rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
        runtime,
        tagline: d.tagline || "",
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }
};
