import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Game, Week } from "@shared/schema";

// Mirrors the shape returned by GET /api/weeks/:id/grid — see server/routes.ts
// computeGrid() and client/src/pages/grid.tsx for the source of truth.
export interface GridRow {
  userId: number;
  name: string;
  weekPoints: number;
  picks: Record<number, { selectedTeam: string; isCorrect: boolean | null }>;
  upsetPick: {
    underdogTeam: string;
    favoriteTeam: string;
    spread: number;
    result: "pending" | "win" | "loss" | "push";
    pointsEarned: number;
  } | null;
}

export interface GridResponse {
  week: Week;
  games: Game[];
  grid: GridRow[];
  consensus: Record<number, unknown>;
}

type RGB = [number, number, number];

const COLOR = {
  correct: [21, 128, 61] as RGB, // green-700 — legible on white paper
  incorrect: [185, 28, 28] as RGB, // red-700
  push: [180, 95, 6] as RGB, // amber-700
  muted: [115, 115, 115] as RGB,
  heading: [40, 40, 40] as RGB,
  subheading: [120, 120, 120] as RGB,
  headFill: [237, 233, 224] as RGB,
};

function matchupHeader(g: Game) {
  const away = g.awayRank ? `#${g.awayRank} ${g.awayTeam}` : g.awayTeam;
  const home = g.homeRank ? `#${g.homeRank} ${g.homeTeam}` : g.homeTeam;
  const spreadLine = `${g.favoriteTeam === g.awayTeam ? "-" : "+"}${g.spread}`;
  return `${away} @ ${home}${g.isMoneyGame ? " ($)" : ""}\n${spreadLine}`;
}

function fileSlug(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "week";
}

/**
 * Builds a landscape PDF of the picks grid (Member, Pts, one column per game,
 * Upset) and triggers a browser download. Wide grids automatically continue
 * onto additional pages, with Member and Pts repeated on every page.
 */
export function downloadGridPdf(data: GridResponse) {
  const { week, games, grid } = data;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  const title = `College Pick'em \u2014 ${week.label} \u2014 Picks Grid`;
  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const head = [["Member", "Pts", ...games.map(matchupHeader), "Upset"]];

  type Category = "correct" | "incorrect" | "push" | "muted" | "normal";
  const bodyMeta: Category[][] = [];

  const body = grid.map((row) => {
    const rowMeta: Category[] = ["normal", "normal"];
    const cells: (string | number)[] = [row.name, row.weekPoints];

    for (const g of games) {
      const pick = row.picks[g.id];
      if (!pick) {
        cells.push("\u2014");
        rowMeta.push("muted");
      } else {
        cells.push(pick.selectedTeam);
        rowMeta.push(pick.isCorrect === true ? "correct" : pick.isCorrect === false ? "incorrect" : "normal");
      }
    }

    if (row.upsetPick) {
      const u = row.upsetPick;
      let label = u.underdogTeam;
      if (u.result !== "pending") {
        label += u.result === "win" ? ` (+${u.pointsEarned})` : u.result === "push" ? " (push)" : " (+0)";
      }
      cells.push(label);
      rowMeta.push(
        u.result === "win" ? "correct" : u.result === "loss" ? "incorrect" : u.result === "push" ? "push" : "muted",
      );
    } else {
      cells.push("\u2014");
      rowMeta.push("muted");
    }

    bodyMeta.push(rowMeta);
    return cells;
  });

  const colorFor: Record<Category, RGB | null> = {
    correct: COLOR.correct,
    incorrect: COLOR.incorrect,
    push: COLOR.push,
    muted: COLOR.muted,
    normal: null,
  };

  autoTable(doc, {
    head,
    body,
    margin: { top: 56, left: 24, right: 24, bottom: 24 },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: COLOR.headFill, textColor: COLOR.heading, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: 32, halign: "center", fontStyle: "bold" },
    },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: [0, 1],
    didParseCell: (hookData) => {
      if (hookData.row.section !== "body") return;
      const category = bodyMeta[hookData.row.index]?.[hookData.column.index];
      const color = category ? colorFor[category] : null;
      if (color) {
        hookData.cell.styles.textColor = color;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...COLOR.heading);
      doc.text(title, 24, 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.subheading);
      doc.text(`Generated ${generatedAt} ET`, 24, 44);
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

  doc.save(`${fileSlug(week.label)}-picks-grid.pdf`);
}
