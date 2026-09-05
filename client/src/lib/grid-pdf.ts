import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Game, Week } from "@shared/schema";

// Mirrors the shape returned by GET /api/weeks/:id/grid — see server/routes.ts
// computeGrid() and client/src/pages/grid.tsx for the source of truth.
export interface GridRow {
  userId: number;
  name: string;
  weekPoints: number;
  totalPoints: number;
  picks: Record<number, { selectedTeam: string; isCorrect: boolean | null }>;
  upsetPick: {
    underdogTeam: string;
    favoriteTeam: string;
    spread: number;
    result: "pending" | "win" | "loss" | "push";
    pointsEarned: number;
  } | null;
}

export interface ConsensusEntry {
  awayCount: number;
  homeCount: number;
  awayPct: number;
  homePct: number;
  totalPicks: number;
}

export interface GridResponse {
  week: Week;
  games: Game[];
  grid: GridRow[];
  consensus: Record<number, ConsensusEntry>;
}

type RGB = [number, number, number];

const COLOR = {
  moneyGame: [151, 211, 79] as RGB, // bright green banner
  headTeal: [58, 130, 122] as RGB,
  headTealText: [255, 255, 255] as RGB,
  infoRow: [246, 248, 246] as RGB, // Away/Home/Favorite/Spread/Time/Result rows
  gridBg: [232, 245, 236] as RGB, // default body cell background
  awayPick: [248, 205, 197] as RGB, // salmon — away team picked
  homePick: [196, 229, 202] as RGB, // green — home team picked
  wasted: [222, 222, 222] as RGB,
  winnerBox: [110, 214, 214] as RGB,
  heading: [40, 40, 40] as RGB,
  subheading: [120, 120, 120] as RGB,
  text: [35, 35, 35] as RGB,
  muted: [140, 140, 140] as RGB,
  upsetWin: [21, 128, 61] as RGB,
  upsetLoss: [185, 28, 28] as RGB,
  upsetPush: [180, 95, 6] as RGB,
  footFill: [225, 233, 227] as RGB,
};

/** Prefixes a team name with its AP rank when it's on the ranked side of `g`. */
function teamLabel(g: Game, team: string): string {
  if (team === g.awayTeam) return g.awayRank ? `#${g.awayRank} ${team}` : team;
  if (team === g.homeTeam) return g.homeRank ? `#${g.homeRank} ${team}` : team;
  return team;
}

/** "3:30" — Eastern Time, 12-hour, no AM/PM suffix (matches the league's printed sheet convention). */
function shortTime(iso: string): string {
  const formatted = new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatted.replace(/\s?[AP]M$/i, "");
}

function fileSlug(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "week";
}

function isWasted(row: GridRow) {
  return Object.keys(row.picks).length === 0 && !row.upsetPick;
}

function weeklyWinnerText(week: Week, grid: GridRow[]): { title: string; body: string } {
  if (week.status !== "graded") {
    return { title: "Weekly Winner", body: "Pending" };
  }
  const scored = grid.filter((r) => !isWasted(r));
  if (scored.length === 0) return { title: "Weekly Winner", body: "\u2014" };
  const max = Math.max(...scored.map((r) => r.weekPoints));
  const winners = scored.filter((r) => r.weekPoints === max);
  const payoutSuffix =
    week.payoutAmount != null ? ` \u00b7 $${week.payoutAmount} ${week.payoutPaid ? "PAID" : "UNPAID"}` : "";
  if (winners.length === 1) {
    return { title: "Weekly Winner", body: `${winners[0].name}${payoutSuffix}` };
  }
  return { title: "Weekly Winner", body: `PUSH${payoutSuffix}` };
}

/**
 * Builds a landscape, spreadsheet-style PDF of the picks grid — money-game
 * markers, per-game Away/Home/Favorite/Spread/Time/Result rows, one row per
 * member with season Total Points + this week's points, home/away-colored
 * picks, an Upset column, and a "# Picks" footer — designed to be
 * screenshotted and shared as a single image, mirroring the league's
 * historical spreadsheet layout. Wide grids continue onto additional pages,
 * with #, Member, Total, and Week Points repeated on every page.
 */
export function buildGridPdfDoc(data: GridResponse): jsPDF {
  const { week, games, grid, consensus } = data;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  const title = `College Pick'em \u2014 ${week.label} \u2014 Picks Grid`;
  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const winner = weeklyWinnerText(week, grid);

  const FIXED_COLS = 4; // #, Member, Total Points, Week Points
  const blankFixed = ["", "", "", ""] as (string | number)[];

  const head: (string | number)[][] = [
    [...blankFixed, ...games.map((g) => (g.isMoneyGame ? "MONEY GAME" : "")), "", ""],
    [
      "#",
      "Member",
      "Total\nPoints",
      `Week ${week.weekNumber}\nPoints`,
      ...games.map((_, i) => `Game ${i + 1}`),
      "Upset",
      "Pts",
    ],
    [...blankFixed, ...games.map((g) => teamLabel(g, g.awayTeam)), "", ""],
    [...blankFixed, ...games.map((g) => teamLabel(g, g.homeTeam)), "", ""],
    [...blankFixed, ...games.map((g) => teamLabel(g, g.favoriteTeam)), "", ""],
    [...blankFixed, ...games.map((g) => String(g.spread)), "", ""],
    [...blankFixed, ...games.map((g) => shortTime(g.kickoff)), "", ""],
    [...blankFixed, ...games.map((g) => (g.status === "final" && g.winner ? teamLabel(g, g.winner) : "\u2013")), "", ""],
  ];
  const HEAD_MONEY_ROW = 0;
  const HEAD_LABEL_ROW = 1;

  type BodyCategory = "away" | "home" | "wasted" | "muted" | "normal" | "upsetWin" | "upsetLoss" | "upsetPush";
  const bodyFill: Record<BodyCategory, RGB | null> = {
    away: COLOR.awayPick,
    home: COLOR.homePick,
    wasted: COLOR.wasted,
    muted: null,
    normal: null,
    upsetWin: null,
    upsetLoss: null,
    upsetPush: null,
  };
  const bodyTextColor: Record<BodyCategory, RGB | null> = {
    away: COLOR.text,
    home: COLOR.text,
    wasted: COLOR.muted,
    muted: COLOR.muted,
    normal: COLOR.text,
    upsetWin: COLOR.upsetWin,
    upsetLoss: COLOR.upsetLoss,
    upsetPush: COLOR.upsetPush,
  };

  const bodyMeta: BodyCategory[][] = [];
  const body = grid.map((row, idx) => {
    const wasted = isWasted(row);
    const rowMeta: BodyCategory[] = ["normal", "normal", "normal", wasted ? "muted" : "normal"];
    const cells: (string | number)[] = [idx + 1, wasted ? "WASTED" : row.name, row.totalPoints, wasted ? "\u2013" : row.weekPoints];

    for (const g of games) {
      if (wasted) {
        cells.push("0");
        rowMeta.push("wasted");
        continue;
      }
      const pick = row.picks[g.id];
      if (!pick) {
        cells.push("\u2014");
        rowMeta.push("muted");
      } else {
        cells.push(teamLabel(g, pick.selectedTeam));
        rowMeta.push(pick.selectedTeam === g.awayTeam ? "away" : "home");
      }
    }

    if (wasted) {
      cells.push("0", "\u2013");
      rowMeta.push("wasted", "wasted");
    } else if (row.upsetPick) {
      const u = row.upsetPick;
      cells.push(`${u.underdogTeam} +${u.spread}`);
      const ptsCell =
        u.result === "win" ? String(u.pointsEarned) : u.result === "push" ? "push" : u.result === "loss" ? "0" : "\u2013";
      const cat: BodyCategory = u.result === "win" ? "upsetWin" : u.result === "loss" ? "upsetLoss" : u.result === "push" ? "upsetPush" : "muted";
      cells.push(ptsCell);
      rowMeta.push(cat, cat);
    } else {
      cells.push("\u2014", "\u2013");
      rowMeta.push("muted", "muted");
    }

    bodyMeta.push(rowMeta);
    return cells;
  });

  const foot: (string | number)[][] = [
    ["", "# Picks", "", "", ...games.map((g) => teamLabel(g, g.awayTeam)), "", ""],
    ["", "", "", "", ...games.map((g) => consensus[g.id]?.awayCount ?? 0), "", ""],
    ["", "# Picks", "", "", ...games.map((g) => teamLabel(g, g.homeTeam)), "", ""],
    ["", "", "", "", ...games.map((g) => consensus[g.id]?.homeCount ?? 0), "", ""],
  ];

  const lastColIndex = FIXED_COLS + games.length + 1; // Pts column

  autoTable(doc, {
    head,
    body,
    foot,
    margin: { top: 68, left: 24, right: 24, bottom: 24 },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3.5, overflow: "linebreak", valign: "middle", fillColor: COLOR.gridBg },
    headStyles: { fontSize: 7, fontStyle: "bold", textColor: COLOR.heading, fillColor: [255, 255, 255] },
    footStyles: { fontSize: 7, fontStyle: "bold", textColor: COLOR.heading, fillColor: COLOR.footFill },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 70, fontStyle: "bold" },
      2: { cellWidth: 32, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 32, halign: "center", fontStyle: "bold" },
      [lastColIndex]: { cellWidth: 26, halign: "center" },
    },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: [0, 1, 2, 3],
    didParseCell: (hookData) => {
      const col = hookData.column.index;
      const isGameCol = col >= FIXED_COLS && col < FIXED_COLS + games.length;

      if (hookData.row.section === "head") {
        if (hookData.row.index === HEAD_MONEY_ROW) {
          const isMoney = isGameCol && typeof hookData.cell.raw === "string" && hookData.cell.raw === "MONEY GAME";
          hookData.cell.styles.fillColor = isMoney ? COLOR.moneyGame : [255, 255, 255];
          hookData.cell.styles.textColor = COLOR.heading;
          hookData.cell.styles.fontSize = 6.5;
        } else if (hookData.row.index === HEAD_LABEL_ROW) {
          hookData.cell.styles.fillColor = COLOR.headTeal;
          hookData.cell.styles.textColor = COLOR.headTealText;
        } else {
          hookData.cell.styles.fillColor = COLOR.infoRow;
          hookData.cell.styles.textColor = COLOR.heading;
        }
        return;
      }

      if (hookData.row.section === "foot") {
        return; // footStyles handles these uniformly
      }

      // body
      const category = bodyMeta[hookData.row.index]?.[col];
      if (!category) return;
      const fill = bodyFill[category];
      const textColor = bodyTextColor[category];
      if (fill) hookData.cell.styles.fillColor = fill;
      if (textColor) hookData.cell.styles.textColor = textColor;
      if (category === "upsetWin" || category === "upsetLoss" || category === "upsetPush") {
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...COLOR.heading);
      doc.text(title, 24, 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.subheading);
      doc.text(`Generated ${generatedAt} ET`, 24, 40);

      // Weekly Winner box, top-right.
      const pageWidth = doc.internal.pageSize.getWidth();
      const boxW = 190;
      const boxH = 32;
      const boxX = pageWidth - 24 - boxW;
      const boxY = 8;
      doc.setFillColor(...COLOR.winnerBox);
      doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...COLOR.heading);
      doc.text(winner.title, boxX + boxW / 2, boxY + 12, { align: "center" });
      doc.setFontSize(10.5);
      doc.text(winner.body, boxX + boxW / 2, boxY + 25, { align: "center", maxWidth: boxW - 10 });
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.subheading);
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 14);
  }

  return doc;
}

/** Builds the grid PDF and triggers a browser download. */
export function downloadGridPdf(data: GridResponse) {
  const doc = buildGridPdfDoc(data);
  doc.save(`${fileSlug(data.week.label)}-picks-grid.pdf`);
}
