import { Graphics, type Container } from "pixi.js";
import type { MutableRefObject } from "react";
import { DELIVERY_SPEED, type Delivery, destroyNode } from "./model";
import { hashStr } from "./drawing-core";

interface BreakAnimItem {
  sprite: Container;
  baseX: number;
  baseY: number;
}

interface UpdateBreakRoomAndDeliveryParams {
  breakAnimItemsRef: MutableRefObject<BreakAnimItem[]>;
  breakSteamParticlesRef: MutableRefObject<Container | null>;
  breakRoomRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  breakBubblesRef: MutableRefObject<Container[]>;
  deliveriesRef: MutableRefObject<Delivery[]>;
}

export function updateBreakRoomAndDeliveryAnimations(
  {
    breakAnimItemsRef,
    breakSteamParticlesRef,
    breakRoomRectRef,
    breakBubblesRef,
    deliveriesRef,
  }: UpdateBreakRoomAndDeliveryParams,
  tick: number,
): void {
  for (const { sprite, baseX, baseY } of breakAnimItemsRef.current) {
    const seed = hashStr((sprite as any)._name || `${baseX}`);
    sprite.position.x = baseX + Math.sin(tick * 0.02 + seed) * 1.5;
    sprite.position.y = baseY + Math.sin(tick * 0.03) * 0.8;
  }

  const steamContainer = breakSteamParticlesRef.current;
  if (steamContainer) {
    if (tick % 20 === 0) {
      const particle = new Graphics();
      particle.circle(0, 0, 1.5 + Math.random()).fill({ color: 0xffffff, alpha: 0.5 });
      const breakRoom = breakRoomRectRef.current;
      if (breakRoom) {
        particle.position.set(breakRoom.x + 26, breakRoom.y + 18);
        (particle as any)._vy = -0.3 - Math.random() * 0.2;
        (particle as any)._life = 0;
        steamContainer.addChild(particle);
      }
    }

    for (let i = steamContainer.children.length - 1; i >= 0; i--) {
      const particle = steamContainer.children[i] as any;
      particle._life++;
      particle.position.y += particle._vy ?? -0.3;
      particle.position.x += Math.sin(particle._life * 0.15) * 0.3;
      particle.alpha = Math.max(0, 0.5 - particle._life * 0.016);
      if (particle._life > 30) {
        steamContainer.removeChild(particle);
        particle.destroy();
      }
    }
  }

  for (const bubble of breakBubblesRef.current) {
    const phase = tick * 0.05;
    bubble.alpha = 0.7 + Math.sin(phase) * 0.3;
  }

  const deliveries = deliveriesRef.current;
  const now = Date.now();
  for (let i = deliveries.length - 1; i >= 0; i--) {
    const delivery = deliveries[i];
    if (delivery.sprite.destroyed) {
      deliveries.splice(i, 1);
      continue;
    }

    if (delivery.holdAtSeat && delivery.arrived) {
      if (!delivery.seatedPoseApplied) {
        for (const child of delivery.sprite.children) {
          const maybeAnim = child as unknown as { stop?: () => void; gotoAndStop?: (frame: number) => void };
          if (typeof maybeAnim.stop === "function" && typeof maybeAnim.gotoAndStop === "function") {
            maybeAnim.stop();
            maybeAnim.gotoAndStop(0);
          }
        }
        delivery.sprite.scale.x = 1;
        delivery.seatedPoseApplied = true;
      }

      delivery.sprite.position.set(delivery.toX, delivery.toY);
      delivery.sprite.alpha = 1;
      if (delivery.holdUntil && now >= delivery.holdUntil) {
        destroyNode(delivery.sprite);
        deliveries.splice(i, 1);
      }
      continue;
    }

    delivery.progress += delivery.speed ?? DELIVERY_SPEED;
    if (delivery.progress >= 1) {
      if (delivery.holdAtSeat) {
        delivery.arrived = true;
        delivery.progress = 1;
        delivery.sprite.position.set(delivery.toX, delivery.toY);
        delivery.sprite.alpha = 1;
        continue;
      }
      destroyNode(delivery.sprite);
      deliveries.splice(i, 1);
    } else if (delivery.type === "walk") {
      const t = delivery.progress;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      delivery.sprite.position.x = delivery.fromX + (delivery.toX - delivery.fromX) * ease;
      delivery.sprite.position.y = delivery.fromY + (delivery.toY - delivery.fromY) * ease;
      const walkBounce = Math.abs(Math.sin(t * Math.PI * 12)) * 3;
      delivery.sprite.position.y -= walkBounce;
      if (t < 0.05) delivery.sprite.alpha = t / 0.05;
      else if (t > 0.9) delivery.sprite.alpha = (1 - t) / 0.1;
      else delivery.sprite.alpha = 1;
      delivery.sprite.scale.x = delivery.toX > delivery.fromX ? 1 : -1;
    } else {
      const t = delivery.progress;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const arc = delivery.arcHeight ?? -30;
      delivery.sprite.position.x = delivery.fromX + (delivery.toX - delivery.fromX) * ease;
      delivery.sprite.position.y =
        delivery.fromY + (delivery.toY - delivery.fromY) * ease + Math.sin(t * Math.PI) * arc;
      delivery.sprite.alpha = t > 0.85 ? (1 - t) / 0.15 : 1;
      delivery.sprite.scale.set(0.8 + Math.sin(t * Math.PI) * 0.3);
    }
  }
}
