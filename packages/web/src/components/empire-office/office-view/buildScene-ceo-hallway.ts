import type { MutableRefObject } from "react";
import { type Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { Agent, Task } from "../types";
import type { Delivery, RoomTheme, WallClockVisual } from "./model";
import { CEO_ZONE_H, HALLWAY_H, TILE } from "./model";
import { LOCALE_TEXT, type SupportedLocale, pickLocale } from "./themes-locale";
import {
  blendColor,
  drawAmbientGlow,
  drawBandGradient,
  drawBunting,
  drawPictureFrame,
  drawRoomAtmosphere,
  drawTiledFloor,
  drawWallClock,
  drawWaterCooler,
} from "./drawing-core";
import { drawChair, drawPlant } from "./drawing-furniture-a";
import { formatPeopleCount, formatTaskCount } from "./drawing-furniture-b";

interface BuildCeoAndHallwayParams {
  app: Application;
  OFFICE_W: number;
  totalH: number;
  breakRoomY: number;
  isDark: boolean;
  activeLocale: SupportedLocale;
  ceoTheme: RoomTheme;
  activeMeetingTaskId: string | null;
  onOpenActiveMeetingMinutes?: (taskId: string) => void;
  agents: Agent[];
  tasks: Task[];
  deliveriesRef: MutableRefObject<Delivery[]>;
  ceoMeetingSeatsRef: MutableRefObject<Array<{ x: number; y: number }>>;
  wallClocksRef: MutableRefObject<WallClockVisual[]>;
  ceoOfficeRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
}

export function buildCeoAndHallway({
  app,
  OFFICE_W,
  totalH,
  breakRoomY,
  isDark,
  activeLocale,
  ceoTheme,
  activeMeetingTaskId,
  onOpenActiveMeetingMinutes,
  agents,
  tasks,
  deliveriesRef,
  ceoMeetingSeatsRef,
  wallClocksRef,
  ceoOfficeRectRef,
}: BuildCeoAndHallwayParams): void {
  const bg = new Graphics();
  const bgFill = isDark ? 0x0e0e1c : 0xf5f0e8;
  const bgGradFrom = isDark ? 0x121222 : 0xf8f4ec;
  const bgGradTo = isDark ? 0x0a0a18 : 0xf0ece4;
  const bgStrokeInner = isDark ? 0x2a2a48 : 0xd8cfc0;
  const bgStrokeOuter = isDark ? 0x222240 : 0xe0d8cc;
  const bgDotColor = isDark ? 0x2a2a48 : 0xd0c8b8;
  bg.roundRect(0, 0, OFFICE_W, totalH, 6).fill(bgFill);
  drawBandGradient(bg, 2, 2, OFFICE_W - 4, totalH - 4, bgGradFrom, bgGradTo, 14, 0.82);
  bg.roundRect(2, 2, OFFICE_W - 4, totalH - 4, 5).stroke({ width: 1.5, color: bgStrokeInner, alpha: 0.55 });
  bg.roundRect(0, 0, OFFICE_W, totalH, 6).stroke({ width: 3, color: bgStrokeOuter });
  for (let i = 0; i < 22; i++) {
    const sx = 12 + ((i * 97) % Math.max(24, OFFICE_W - 24));
    const sy = 12 + ((i * 131) % Math.max(24, totalH - 24));
    bg.circle(sx, sy, i % 3 === 0 ? 1.1 : 0.8).fill({ color: bgDotColor, alpha: i % 2 === 0 ? 0.12 : 0.08 });
  }
  app.stage.addChild(bg);

  const ceoLayer = new Container();
  ceoOfficeRectRef.current = { x: 4, y: 4, w: OFFICE_W - 8, h: CEO_ZONE_H - 4 };
  const ceoFloor = new Graphics();
  drawTiledFloor(ceoFloor, 4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, ceoTheme.floor1, ceoTheme.floor2);
  ceoLayer.addChild(ceoFloor);
  drawRoomAtmosphere(ceoLayer, 4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, ceoTheme.wall, ceoTheme.accent);
  const ceoBorder = new Graphics();
  ceoBorder
    .roundRect(4, 4, OFFICE_W - 8, CEO_ZONE_H - 4, 3)
    .stroke({ width: 2, color: blendColor(ceoTheme.wall, ceoTheme.accent, 0.55) });
  ceoBorder
    .roundRect(3, 3, OFFICE_W - 6, CEO_ZONE_H - 2, 4)
    .stroke({ width: 1, color: blendColor(ceoTheme.accent, 0xffffff, 0.2), alpha: 0.35 });
  ceoLayer.addChild(ceoBorder);

  const ceoLabel = new Text({
    text: pickLocale(activeLocale, LOCALE_TEXT.ceoOffice),
    style: new TextStyle({
      fontSize: 10,
      fill: 0xffffff,
      fontWeight: "bold",
      fontFamily: "monospace",
      letterSpacing: 2,
    }),
  });
  const ceoLabelBg = new Graphics();
  ceoLabelBg
    .roundRect(10, 6, ceoLabel.width + 8, 14, 3)
    .fill({ color: blendColor(ceoTheme.accent, ceoTheme.wall, 0.35), alpha: 1 });
  ceoLabelBg
    .roundRect(10, 6, ceoLabel.width + 8, 14, 3)
    .stroke({ width: 1, color: blendColor(ceoTheme.accent, 0xffffff, 0.2), alpha: 0.8 });
  ceoLabel.position.set(12, 8);
  ceoLayer.addChild(ceoLabelBg);
  ceoLayer.addChild(ceoLabel);
  drawBunting(
    ceoLayer,
    148,
    11,
    Math.max(120, OFFICE_W - 300),
    blendColor(ceoTheme.accent, 0xffffff, 0.2),
    blendColor(ceoTheme.wall, ceoTheme.accent, 0.45),
    0.7,
  );

  const cdx = 50;
  const cdy = 28;
  const cdg = new Graphics();
  const deskEdge = isDark ? 0x3a2a18 : 0xb8925c;
  const deskTop = isDark ? 0x4a3828 : 0xd0a870;
  const monitorFrame = isDark ? 0x1a1a2a : 0x2a2a3a;
  const monitorScreen = isDark ? 0x2255aa : 0x4488cc;
  const namePlate = isDark ? 0x5a4820 : 0xe8c060;
  cdg.roundRect(cdx, cdy, 64, 34, 3).fill(deskEdge);
  cdg.roundRect(cdx + 1, cdy + 1, 62, 32, 2).fill(deskTop);
  cdg.roundRect(cdx + 19, cdy + 2, 26, 16, 2).fill(monitorFrame);
  cdg.roundRect(cdx + 20.5, cdy + 3.5, 23, 12, 1).fill(monitorScreen);
  cdg.roundRect(cdx + 22, cdy + 24, 20, 7, 2).fill(namePlate);
  ceoLayer.addChild(cdg);
  const ceoPlateText = new Text({
    text: "CEO",
    style: new TextStyle({ fontSize: 5, fill: 0x000000, fontWeight: "bold", fontFamily: "monospace" }),
  });
  ceoPlateText.anchor.set(0.5, 0.5);
  ceoPlateText.position.set(cdx + 32, cdy + 27.5);
  ceoLayer.addChild(ceoPlateText);
  drawChair(ceoLayer, cdx + 32, cdy + 46, 0xd4a860);

  const mtW = 220;
  const mtH = 28;
  const mtX = Math.floor((OFFICE_W - mtW) / 2);
  const mtY = 48;
  const mt = new Graphics();
  const tableEdge = isDark ? 0x2a2018 : 0xb89060;
  const tableTop = isDark ? 0x382818 : 0xd0a878;
  const tableInlay = isDark ? 0x4a3828 : 0xf7e4c0;
  mt.roundRect(mtX, mtY, mtW, mtH, 12).fill(tableEdge);
  mt.roundRect(mtX + 3, mtY + 3, mtW - 6, mtH - 6, 10).fill(tableTop);
  mt.roundRect(mtX + 64, mtY + 8, 92, 12, 5).fill({ color: tableInlay, alpha: isDark ? 0.3 : 0.45 });
  if (activeMeetingTaskId && onOpenActiveMeetingMinutes) {
    mt.eventMode = "static";
    mt.cursor = "pointer";
    mt.on("pointerdown", () => {
      if (!activeMeetingTaskId) return;
      onOpenActiveMeetingMinutes(activeMeetingTaskId);
    });
  }
  ceoLayer.addChild(mt);

  const meetingSeatX = [mtX + 40, mtX + 110, mtX + 180];
  for (const sx of meetingSeatX) {
    drawChair(ceoLayer, sx, mtY - 4, 0xc4a070);
    drawChair(ceoLayer, sx, mtY + mtH + 10, 0xc4a070);
  }

  const meetingLabel = new Text({
    text: pickLocale(activeLocale, LOCALE_TEXT.collabTable),
    style: new TextStyle({
      fontSize: 7,
      fill: 0x7a5c2a,
      fontWeight: "bold",
      fontFamily: "monospace",
      letterSpacing: 1,
    }),
  });
  meetingLabel.anchor.set(0.5, 0.5);
  meetingLabel.position.set(mtX + mtW / 2, mtY + mtH / 2);
  ceoLayer.addChild(meetingLabel);

  ceoMeetingSeatsRef.current = [
    { x: meetingSeatX[0], y: mtY + 2 },
    { x: meetingSeatX[1], y: mtY + 2 },
    { x: meetingSeatX[2], y: mtY + 2 },
    { x: meetingSeatX[0], y: mtY + mtH + 20 },
    { x: meetingSeatX[1], y: mtY + mtH + 20 },
    { x: meetingSeatX[2], y: mtY + mtH + 20 },
  ];

  deliveriesRef.current = deliveriesRef.current.filter((delivery) => !delivery.sprite.destroyed);
  for (const delivery of deliveriesRef.current) {
    if (!delivery.holdAtSeat || typeof delivery.meetingSeatIndex !== "number") continue;
    const seat = ceoMeetingSeatsRef.current[delivery.meetingSeatIndex % ceoMeetingSeatsRef.current.length];
    if (!seat) continue;
    delivery.toX = seat.x;
    delivery.toY = seat.y;
    if (delivery.arrived) {
      delivery.sprite.position.set(seat.x, seat.y);
    } else {
      delivery.fromX = delivery.sprite.position.x;
      delivery.fromY = delivery.sprite.position.y;
      delivery.progress = 0;
    }
  }

  drawPictureFrame(ceoLayer, 14, 14);
  wallClocksRef.current.push(drawWallClock(ceoLayer, OFFICE_W - 30, 18));

  const workingCount = agents.filter((agent) => agent.status === "working").length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const stats = [
    {
      icon: "🤖",
      label: pickLocale(activeLocale, LOCALE_TEXT.statsEmployees),
      val: formatPeopleCount(agents.length, activeLocale),
    },
    {
      icon: "⚡",
      label: pickLocale(activeLocale, LOCALE_TEXT.statsWorking),
      val: formatPeopleCount(workingCount, activeLocale),
    },
    {
      icon: "📋",
      label: pickLocale(activeLocale, LOCALE_TEXT.statsProgress),
      val: formatTaskCount(inProgress, activeLocale),
    },
    {
      icon: "✅",
      label: pickLocale(activeLocale, LOCALE_TEXT.statsDone),
      val: `${doneCount}/${tasks.length}`,
    },
  ];
  stats.forEach((stat, index) => {
    const sx = OFFICE_W - 340 + index * 82;
    const sy = 12;
    const statCard = new Graphics();
    statCard.roundRect(sx, sy, 74, 26, 4).fill({ color: 0xfff4d8, alpha: 0.85 });
    statCard.roundRect(sx, sy, 74, 26, 4).stroke({ width: 1, color: 0xe8c870, alpha: 0.5 });
    ceoLayer.addChild(statCard);
    const iconText = new Text({ text: stat.icon, style: new TextStyle({ fontSize: 10 }) });
    iconText.position.set(sx + 4, sy + 4);
    ceoLayer.addChild(iconText);
    ceoLayer.addChild(
      Object.assign(
        new Text({
          text: stat.label,
          style: new TextStyle({ fontSize: 7, fill: 0x8b7040, fontFamily: "monospace" }),
        }),
        { x: sx + 18, y: sy + 2 },
      ),
    );
    ceoLayer.addChild(
      Object.assign(
        new Text({
          text: stat.val,
          style: new TextStyle({ fontSize: 10, fill: 0x5a4020, fontWeight: "bold", fontFamily: "monospace" }),
        }),
        { x: sx + 18, y: sy + 13 },
      ),
    );
  });

  const hint = new Text({
    text: pickLocale(activeLocale, LOCALE_TEXT.hint),
    style: new TextStyle({
      fontSize: 10,
      fontWeight: "bold",
      fill: 0x8b7040,
      fontFamily: "monospace",
    }),
  });
  hint.anchor.set(1, 1);
  hint.position.set(OFFICE_W - 16, CEO_ZONE_H - 8);
  ceoLayer.addChild(hint);
  if (activeMeetingTaskId) {
    const meetingHint = new Text({
      text: pickLocale(activeLocale, LOCALE_TEXT.meetingTableHint),
      style: new TextStyle({
        fontSize: 12,
        fill: 0x8b6b30,
        fontWeight: "bold",
        fontFamily: "system-ui, sans-serif",
      }),
    });
    meetingHint.anchor.set(1, 1);
    meetingHint.position.set(hint.position.x - hint.width - 18, hint.position.y);
    ceoLayer.addChild(meetingHint);
  }

  drawAmbientGlow(ceoLayer, OFFICE_W / 2, CEO_ZONE_H / 2, OFFICE_W * 0.35, ceoTheme.accent, 0.08);
  drawPlant(ceoLayer, 18, 62, 0);
  drawPlant(ceoLayer, OFFICE_W - 22, 62, 2);
  drawWaterCooler(ceoLayer, 28, 30);

  ceoLayer.addChild(ceoLabelBg);
  ceoLayer.addChild(ceoLabel);
  app.stage.addChild(ceoLayer);

  const hallY = CEO_ZONE_H;
  const hallG = new Graphics();
  const hallBase = isDark ? 0x252535 : 0xe8dcc8;
  const hallTile1 = isDark ? 0x2d2d40 : 0xf0e4d0;
  const hallTile2 = isDark ? 0x1f1f30 : 0xe8dcc8;
  const hallDash = isDark ? 0x3a3858 : 0xc8b898;
  const hallTrim = isDark ? 0x3a3858 : 0xd4c4a8;
  const hallGlow = isDark ? 0x3355bb : 0xfff8e0;
  hallG.rect(4, hallY, OFFICE_W - 8, HALLWAY_H).fill(hallBase);
  drawBandGradient(hallG, 4, hallY, OFFICE_W - 8, HALLWAY_H, hallTile1, hallTile2, 5, 0.38);
  for (let dx = 4; dx < OFFICE_W - 4; dx += TILE * 2) {
    hallG.rect(dx, hallY, TILE * 2, HALLWAY_H).fill({ color: hallTile1, alpha: 0.5 });
    hallG.rect(dx + TILE * 2, hallY, TILE * 2, HALLWAY_H).fill({ color: hallTile2, alpha: 0.3 });
  }
  for (let dx = 20; dx < OFFICE_W - 20; dx += 16) {
    hallG.rect(dx, hallY + HALLWAY_H / 2, 6, 1).fill({ color: hallDash, alpha: 0.4 });
  }
  hallG.rect(4, hallY, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
  hallG.rect(4, hallY + HALLWAY_H - 1.5, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
  hallG
    .ellipse(OFFICE_W / 2, hallY + HALLWAY_H / 2 + 1, Math.max(120, OFFICE_W * 0.28), 6)
    .fill({ color: hallGlow, alpha: isDark ? 0.06 : 0.08 });

  const hall2Y = breakRoomY - HALLWAY_H;
  hallG.rect(4, hall2Y, OFFICE_W - 8, HALLWAY_H).fill(hallBase);
  drawBandGradient(hallG, 4, hall2Y, OFFICE_W - 8, HALLWAY_H, hallTile1, hallTile2, 5, 0.38);
  for (let dx = 4; dx < OFFICE_W - 4; dx += TILE * 2) {
    hallG.rect(dx, hall2Y, TILE * 2, HALLWAY_H).fill({ color: hallTile1, alpha: 0.5 });
    hallG.rect(dx + TILE * 2, hall2Y, TILE * 2, HALLWAY_H).fill({ color: hallTile2, alpha: 0.3 });
  }
  for (let dx = 20; dx < OFFICE_W - 20; dx += 16) {
    hallG.rect(dx, hall2Y + HALLWAY_H / 2, 6, 1).fill({ color: hallDash, alpha: 0.4 });
  }
  hallG.rect(4, hall2Y, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
  hallG.rect(4, hall2Y + HALLWAY_H - 1.5, OFFICE_W - 8, 1.5).fill({ color: hallTrim, alpha: 0.5 });
  hallG
    .ellipse(OFFICE_W / 2, hall2Y + HALLWAY_H / 2 + 1, Math.max(120, OFFICE_W * 0.28), 6)
    .fill({ color: hallGlow, alpha: isDark ? 0.06 : 0.08 });

  app.stage.addChild(hallG);
  drawPlant(app.stage as Container, 30, hallY + HALLWAY_H - 6, 2);
  drawPlant(app.stage as Container, OFFICE_W - 30, hallY + HALLWAY_H - 6, 1);
}
