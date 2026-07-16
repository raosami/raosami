// Generates an animated SVG of a rabbit hopping across a real GitHub
// contribution graph, "eating" (dimming) each cell as it passes.
//
// Env vars:
//   GITHUB_TOKEN     - token with public read access (Actions default token works)
//   RABBIT_USERNAME  - GitHub username to fetch the contribution calendar for

const TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.RABBIT_USERNAME || "raosami";

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              weekday
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function fetchWeeks() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

function level(count) {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}

const CELL = 10;
const GAP = 3;
const PITCH = CELL + GAP;
const MARGIN = 6;
const TOP_PAD = 16; // headroom for ears + hop arc
const HOP_HEIGHT = 9;
const FADE_DUR = 0.35;

const PALETTES = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

function buildCells(weeks) {
  const grid = weeks.map((week) => {
    const col = new Array(7).fill(0);
    for (const day of week.contributionDays) {
      col[day.weekday] = day.contributionCount;
    }
    return col;
  });

  const cells = [];
  grid.forEach((col, w) => {
    const rowOrder = w % 2 === 0 ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
    for (const r of rowOrder) {
      cells.push({
        x: MARGIN + w * PITCH + CELL / 2,
        y: TOP_PAD + r * PITCH + CELL / 2,
        count: col[r],
      });
    }
  });
  return { cells, cols: grid.length };
}

function buildMotionPath(cells) {
  let d = `M ${cells[0].x} ${cells[0].y}`;
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    const midx = (prev.x + cur.x) / 2;
    const midy = Math.min(prev.y, cur.y) - HOP_HEIGHT;
    d += ` Q ${midx} ${midy} ${cur.x} ${cur.y}`;
  }
  return d;
}

function rabbitMarkup(fill, earFill) {
  return `
    <g>
      <ellipse cx="4.5" cy="3" rx="1.3" ry="1" fill="${fill}"/>
      <ellipse cx="-1.6" cy="-8" rx="1.2" ry="4" fill="${fill}" transform="rotate(-16 -1.6 -8)"/>
      <ellipse cx="1.6" cy="-8" rx="1.2" ry="4" fill="${fill}" transform="rotate(16 1.6 -8)"/>
      <ellipse cx="-1.6" cy="-8" rx="0.55" ry="2.4" fill="${earFill}" transform="rotate(-16 -1.6 -8)"/>
      <ellipse cx="1.6" cy="-8" rx="0.55" ry="2.4" fill="${earFill}" transform="rotate(16 1.6 -8)"/>
      <ellipse cx="0" cy="2" rx="5" ry="4" fill="${fill}"/>
      <circle cx="0" cy="-3" r="3.4" fill="${fill}"/>
      <circle cx="-1.3" cy="-3.4" r="0.5" fill="#222"/>
      <circle cx="1.3" cy="-3.4" r="0.5" fill="#222"/>
      <circle cx="0" cy="-1.8" r="0.55" fill="${earFill}"/>
    </g>
  `;
}

function renderSvg(weeks, dark) {
  const { cells, cols } = buildCells(weeks);
  const palette = dark ? PALETTES.dark : PALETTES.light;
  const rabbitFill = dark ? "#e6e6e6" : "#ffffff";
  const earFill = "#ffb6c1";

  const width = MARGIN * 2 + cols * PITCH - GAP;
  const height = TOP_PAD + 7 * PITCH - GAP + MARGIN;

  const duration = Math.min(26, Math.max(14, cells.length * 0.08));
  const timePerCell = duration / cells.length;

  const rects = cells
    .map((c, idx) => {
      const fill = palette[level(c.count)];
      const begin = idx * timePerCell;
      const fadeFrac = Math.min(0.98, FADE_DUR / duration);
      return `<rect x="${c.x - CELL / 2}" y="${c.y - CELL / 2}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${fill}">
        <animate attributeName="opacity" values="1;0.4;0.4" keyTimes="0;${fadeFrac};1" dur="${duration}s" begin="${begin}s" repeatCount="indefinite"/>
      </rect>`;
    })
    .join("\n");

  const motionPath = buildMotionPath(cells);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g>
    ${rects}
  </g>
  <g>
    ${rabbitMarkup(rabbitFill, earFill)}
    <animateMotion dur="${duration}s" repeatCount="indefinite" path="${motionPath}" rotate="0"/>
    <animateTransform attributeName="transform" type="scale" values="1,1;1.15,0.85;1,1" dur="${timePerCell}s" repeatCount="indefinite" additive="sum"/>
  </g>
</svg>`;
}

const fs = await import("node:fs/promises");

const weeks = await fetchWeeks();
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/github-rabbit.svg", renderSvg(weeks, false));
await fs.writeFile("dist/github-rabbit-dark.svg", renderSvg(weeks, true));

console.log(`Rabbit SVGs generated for ${USERNAME} (${weeks.length} weeks).`);
