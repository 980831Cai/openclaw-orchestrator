import { type Container, Graphics } from "pixi.js";
import { blendColor } from "./drawing-core";
import { LOCALE_TEXT, OFFICE_PASTEL, pickLocale, type SupportedLocale } from "./themes-locale";

function drawBookshelf(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Shadow (deeper, offset)
  g.roundRect(x + 2, y + 2, 28, 18, 2).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(x + 1, y + 1, 28, 18, 2).fill({ color: 0x000000, alpha: 0.08 });
  // Shelf frame (warmer wood)
  g.roundRect(x, y, 28, 18, 2).fill(0xb89050);
  g.roundRect(x, y, 28, 18, 2).stroke({ width: 0.5, color: 0xa07838 });
  g.rect(x + 1, y + 1, 26, 16).fill(0xa88040);
  // Frame top highlight
  g.moveTo(x + 2, y + 0.5)
    .lineTo(x + 26, y + 0.5)
    .stroke({ width: 0.4, color: 0xd8b060, alpha: 0.4 });
  // Middle shelf
  g.rect(x + 1, y + 8.5, 26, 1.5).fill(0xc09848);
  // Books (warmer pastel tones for charm)
  const colors = [0xdd5555, 0x5588dd, 0x55bb66, 0xddbb44, 0xaa66cc, 0xe88855];
  const widths = [3.5, 4, 3, 4.5, 3.5, 4];
  let bx = x + 2;
  for (let i = 0; i < 5 && bx < x + 25; i++) {
    const w = widths[i % widths.length];
    const h = 5 + (i % 3);
    g.rect(bx, y + 8 - h, w, h).fill(colors[i]);
    // Book spine line
    g.moveTo(bx + w / 2, y + 8 - h + 1)
      .lineTo(bx + w / 2, y + 7)
      .stroke({ width: 0.3, color: 0xffffff, alpha: 0.15 });
    bx += w + 0.8;
  }
  bx = x + 2;
  for (let i = 0; i < 4 && bx < x + 25; i++) {
    const w = widths[(i + 2) % widths.length];
    const h = 4.5 + (i % 2);
    g.rect(bx, y + 17 - h, w, h).fill(colors[(i + 3) % colors.length]);
    bx += w + 1;
  }
  // Tiny trophy/figure on shelf
  g.rect(x + 23, y + 2, 2, 4).fill(0xddaa33);
  g.circle(x + 24, y + 1, 1.5).fill(0xffcc44);
  parent.addChild(g);
}

function drawCoffeeMachine(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // Shadow
  g.ellipse(x + 10, y + 30, 13, 3.5).fill({ color: OFFICE_PASTEL.cocoa, alpha: 0.1 });
  // Body (warmer, more premium feel)
  g.roundRect(x, y, 20, 28, 3).fill(0x7e8898);
  g.roundRect(x + 0.5, y + 0.5, 19, 27, 2.5).fill(0x939daf);
  g.roundRect(x + 1, y + 1, 18, 26, 2).fill(0xa1abc1);
  // Chrome top panel
  g.roundRect(x + 2, y + 2, 16, 5, 1.5).fill(0xc4cdd9);
  g.roundRect(x + 2, y + 2, 16, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  // Brand logo (tiny coffee icon)
  g.circle(x + 10, y + 4.5, 1.5).fill(0x8d654c);
  g.circle(x + 10, y + 4.5, 0.8).fill(0xb89070);
  // Buttons (with glow rings)
  g.circle(x + 6, y + 9, 2.5).fill(0xc07080);
  g.circle(x + 6, y + 9, 1.8).fill(0xe28e9f);
  g.circle(x + 6, y + 9, 0.8).fill(0xf3b8c3);
  g.circle(x + 14, y + 9, 2.5).fill(0x70a088);
  g.circle(x + 14, y + 9, 1.8).fill(0x8ebda7);
  g.circle(x + 14, y + 9, 0.8).fill(0xb5dbc7);
  // Display (LED screen with text)
  g.roundRect(x + 3, y + 12, 14, 4, 0.8).fill(0x1e2e40);
  g.roundRect(x + 3, y + 12, 14, 4, 0.8).stroke({ width: 0.3, color: 0x4a5a6a, alpha: 0.5 });
  g.moveTo(x + 4.5, y + 14)
    .lineTo(x + 12, y + 14)
    .stroke({ width: 0.5, color: 0xb8f0de, alpha: 0.6 });
  g.circle(x + 15, y + 14, 0.5).fill({ color: 0x44dd66, alpha: 0.5 });
  // Nozzle / drip area
  g.rect(x + 6, y + 17, 8, 2).fill(0x4b556a);
  g.roundRect(x + 7.5, y + 19, 5, 4, 0.5).fill(0x3a4558);
  // Drip tray
  g.roundRect(x + 4, y + 23, 12, 1.5, 0.5).fill(0x5a6478);
  // Cup with latte art
  g.roundRect(x + 5.5, y + 21, 9, 7, 2).fill(0xfdf8f4);
  g.roundRect(x + 5.5, y + 21, 9, 7, 2).stroke({ width: 0.4, color: 0xd9cfc6 });
  g.ellipse(x + 10, y + 23, 3.5, 1.5).fill(0x8d654c);
  // Latte art heart
  g.circle(x + 9.3, y + 22.8, 0.8).fill(0xf0e0d0);
  g.circle(x + 10.7, y + 22.8, 0.8).fill(0xf0e0d0);
  g.moveTo(x + 8.5, y + 23)
    .lineTo(x + 10, y + 24.2)
    .lineTo(x + 11.5, y + 23)
    .fill({ color: 0xf0e0d0, alpha: 0.8 });
  // Handle
  g.moveTo(x + 14.5, y + 22)
    .quadraticCurveTo(x + 16.5, y + 24.5, x + 14.5, y + 27)
    .stroke({ width: 1, color: 0xf2e9e2 });
  parent.addChild(g);
}

function drawSofa(parent: Container, x: number, y: number, color: number) {
  const g = new Graphics();
  const seatBase = blendColor(color, OFFICE_PASTEL.creamWhite, 0.18);
  const seatFront = blendColor(seatBase, OFFICE_PASTEL.ink, 0.08);
  const seatBack = blendColor(seatBase, OFFICE_PASTEL.ink, 0.18);
  const seatDark = blendColor(seatBase, OFFICE_PASTEL.ink, 0.28);
  // Floor shadow
  g.ellipse(x + 40, y + 20, 44, 5).fill({ color: 0x000000, alpha: 0.06 });
  // Sofa feet (tiny wooden)
  g.roundRect(x + 2, y + 16, 4, 3, 1).fill(0xb89060);
  g.roundRect(x + 74, y + 16, 4, 3, 1).fill(0xb89060);
  // Seat cushion
  g.roundRect(x, y, 80, 18, 5).fill(seatBase);
  g.roundRect(x + 2, y + 2, 76, 14, 4).fill(seatFront);
  // Seat highlight (top edge)
  g.moveTo(x + 6, y + 1.5)
    .lineTo(x + 74, y + 1.5)
    .stroke({ width: 0.6, color: 0xffffff, alpha: 0.14 });
  // Backrest (taller, with detail)
  g.roundRect(x + 3, y - 10, 74, 12, 4).fill(seatBack);
  g.roundRect(x + 3, y - 10, 74, 12, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.15 });
  // Backrest highlight
  g.roundRect(x + 6, y - 9, 68, 3, 2).fill({ color: 0xffffff, alpha: 0.08 });
  // Armrests (rounder, softer)
  g.roundRect(x - 5, y - 8, 9, 24, 4).fill(seatBack);
  g.roundRect(x - 5, y - 8, 9, 24, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.12 });
  g.roundRect(x + 76, y - 8, 9, 24, 4).fill(seatBack);
  g.roundRect(x + 76, y - 8, 9, 24, 4).stroke({ width: 0.5, color: seatDark, alpha: 0.12 });
  // Armrest top highlights
  g.roundRect(x - 3, y - 7, 5, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(x + 78, y - 7, 5, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  // Cushion divider lines (softer)
  g.moveTo(x + 27, y + 3)
    .lineTo(x + 27, y + 14)
    .stroke({ width: 0.6, color: 0x000000, alpha: 0.1 });
  g.moveTo(x + 53, y + 3)
    .lineTo(x + 53, y + 14)
    .stroke({ width: 0.6, color: 0x000000, alpha: 0.1 });
  // Cushion puff highlights
  g.ellipse(x + 14, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  g.ellipse(x + 40, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  g.ellipse(x + 66, y + 7, 8, 4).fill({ color: 0xffffff, alpha: 0.06 });
  // Decorative throw pillow (cute accent)
  g.roundRect(x + 6, y - 3, 10, 8, 3).fill(blendColor(color, 0xffffff, 0.3));
  g.roundRect(x + 6, y - 3, 10, 8, 3).stroke({ width: 0.4, color: seatDark, alpha: 0.15 });
  // Pillow pattern (tiny star)
  g.star(x + 11, y + 1, 5, 1.5, 0.8, 0).fill({ color: 0xffffff, alpha: 0.15 });
  parent.addChild(g);
}

function drawCoffeeTable(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // table top (elliptical)
  g.ellipse(x + 18, y + 5, 18, 8).fill(0xb89060);
  g.ellipse(x + 18, y + 5, 16, 6).fill(0xd0a878);
  // legs
  g.rect(x + 6, y + 10, 3, 8).fill(0xa07840);
  g.rect(x + 27, y + 10, 3, 8).fill(0xa07840);
  // coffee cup
  g.roundRect(x + 12, y + 1, 5, 4, 1).fill(0xfffaf6);
  g.rect(x + 13, y + 2, 3, 2).fill(0x8d654c);
  // snack plate
  g.ellipse(x + 24, y + 4, 4, 2.5).fill(0xf4ede6);
  g.circle(x + 23, y + 3.5, 1.5).fill(0xedc27a);
  g.circle(x + 25.5, y + 4, 1.5).fill(0xdba282);
  parent.addChild(g);
}

function drawHighTable(parent: Container, x: number, y: number) {
  const g = new Graphics();
  // table top
  g.roundRect(x, y, 36, 14, 2).fill(0xb89060);
  g.roundRect(x + 1, y + 1, 34, 12, 1).fill(0xd0a878);
  // legs
  g.rect(x + 4, y + 14, 3, 16).fill(0xa07840);
  g.rect(x + 29, y + 14, 3, 16).fill(0xa07840);
  // crossbar
  g.rect(x + 6, y + 24, 24, 2).fill(0xa07840);
  parent.addChild(g);
}

function drawVendingMachine(parent: Container, x: number, y: number) {
  const g = new Graphics();
  g.roundRect(x, y, 22, 30, 2).fill(0x7e8da6);
  g.roundRect(x + 1, y + 1, 20, 28, 1).fill(0x98a7c0);
  // display rows of drinks
  const drinkColors = [0xea9ba8, 0x8fb9d8, 0x9fceac, 0xf3c07e, 0xdfafc9, 0xb29ed7];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      g.roundRect(x + 3 + c * 6, y + 3 + r * 7, 4, 5, 1).fill(drinkColors[(r * 3 + c) % drinkColors.length]);
    }
  }
  // dispense slot
  g.roundRect(x + 4, y + 24, 14, 4, 1).fill(0x4f5a72);
  parent.addChild(g);
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function formatReset(iso: string, locale: SupportedLocale): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return pickLocale(locale, LOCALE_TEXT.soon);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) {
    if (locale === "ko") return `${h}시간 ${m}분`;
    if (locale === "ja") return `${h}時間 ${m}分`;
    if (locale === "zh") return `${h}小时 ${m}分`;
    return `${h}h ${m}m`;
  }
  if (locale === "ko") return `${m}분`;
  if (locale === "ja") return `${m}分`;
  if (locale === "zh") return `${m}分`;
  return `${m}m`;
}

function formatPeopleCount(count: number, locale: SupportedLocale): string {
  if (locale === "ko") return `${count}명`;
  if (locale === "ja") return `${count}人`;
  if (locale === "zh") return `${count}人`;
  return `${count}`;
}

function formatTaskCount(count: number, locale: SupportedLocale): string {
  if (locale === "ko") return `${count}건`;
  if (locale === "ja") return `${count}件`;
  if (locale === "zh") return `${count}项`;
  return `${count}`;
}

export {
  drawBookshelf,
  drawCoffeeMachine,
  drawSofa,
  drawCoffeeTable,
  drawHighTable,
  drawVendingMachine,
  formatReset,
  formatPeopleCount,
  formatTaskCount,
};
