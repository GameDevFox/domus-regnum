import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";

import { HUMAN_WALK_ACCEL, HUMAN_WALK_SPEED } from "@kitsune/common";

import { textureLoader } from "@kitsune/common-web";
import { Scope } from "@kitsune/common-web/src/scope";
import { Value } from "@kitsune/common-web/src/value";

import { LevelNav } from "../../blocks/level-nav";
import { createSprite } from "../../domus/create-sprite";
import { Bin, HaulAgent, HaulWorld, Item } from "../../world/haul";
import { NodeId } from "../../world/nav";

import { liveAgents } from "./live-agents";
import { AGENT_COLORS, avatar, mountSim, pickDistinct } from "./shared";

// The Game Demo's icon spritesheet, loaded on FIRST USE rather than at module scope (unlike
// domus/materials.ts) — this module reaches headless tests via blocks-scene, and
// TextureLoader.load touches `document`.
let iconsTexture: Texture | null = null;
const icons = () => (iconsTexture ??= textureLoader.load("/textures/icons.png"));

// The haul demo: agents grab trash and haul it to the nearest bin; respawns when clean so it loops.
export const buildHaul = (
  group: Group,
  scope: Scope,
  levelNav: LevelNav,
  time: Value<number>,
  billboards: Value<boolean>,
): void => {
  const { nav } = levelNav;
  const nodeIds = nav.nodeIds;
  const picks = pickDistinct(nodeIds, Math.min(2 + 12 + 4, nodeIds.length));
  let k = 0;
  const binNodes = picks.slice(k, (k += 2));
  const itemNodes = picks.slice(k, (k += 12));
  const agentNodes = picks.slice(k, (k += 4));

  const bins: Bin[] = binNodes.map((n, i) => ({ id: `bin${i}`, node: n, position: nav.positionOf(n) }));
  const items: Item[] = itemNodes.map((n, i) => ({
    id: `t${i}`,
    node: n,
    position: nav.positionOf(n),
    state: "loose",
    carrier: null,
  }));
  const agents: HaulAgent[] = agentNodes.map((n, i) =>
    HaulAgent({ id: `a${i}`, location: n, position: nav.positionOf(n), speed: HUMAN_WALK_SPEED, accel: HUMAN_WALK_ACCEL }),
  );
  // Publish the live roster so the door-swing controller (sims/doors.ts) reacts to these agents.
  liveAgents.set(agents);
  scope.add(() => liveAgents.set([]));
  const world = HaulWorld({ nav, agents, items, bins });

  const binGeo = new BoxGeometry(0.4, 0.5, 0.4);
  binGeo.translate(0, 0.25, 0);
  const binMat = new MeshStandardMaterial({ color: 0x3ddc84, roughness: 0.5 });
  bins.forEach((bin) => {
    const m = new Mesh(binGeo, binMat);
    m.position.copy(bin.position);
    group.add(m);
  });

  const itemGeo = new BoxGeometry(0.16, 0.16, 0.16);
  itemGeo.translate(0, 0.08, 0); // bottom at the origin, like the bins — loose boxes SIT ON the floor
  const itemMat = new MeshStandardMaterial({ color: 0xb0a18f, roughness: 0.8 });
  // Each item has two looks under one positioned group, mirroring the agent avatars: the 3D box,
  // and a tiny billboard showing a RANDOM Game Demo icon (a three.js Sprite — full camera-facing;
  // no horizontal locking at this size). The billboards toggle flips which is shown.
  const itemSprite = () => {
    // Guarded like maidSprite (maids/avatar-sprite.ts): the deterministic vitest harness mounts
    // the sims with no DOM, and TextureLoader.load touches `document`. Headless gets a bare,
    // never-rendered texture.
    const texture = typeof document === "undefined" ? new Texture() : icons().clone();
    // Window one random icon from the 10×10 sheet with PURE grid fractions (not
    // TextureWindowGrid, which reads the texture's pixel size — undefined until the image
    // arrives, and the first sim mount is what triggers the load). Clones share the loader's
    // Source, so the image fills in for every sprite once it lands.
    const i = Math.floor(Math.random() * 100);
    texture.repeat.set(1 / 10, 1 / 10);
    texture.offset.set((i % 10) / 10, 1 - (Math.floor(i / 10) + 1) / 10);
    const sprite = createSprite(texture);
    sprite.scale.set(0.32, 0.32, 1); // 2× the box, so the icon art reads at game distance
    sprite.position.y = 0.16; // sprite is centered — half its height up puts its bottom on the floor
    return sprite;
  };
  const itemMeshes = items.map(() => {
    const itemGroup = new Group();
    const box = new Mesh(itemGeo, itemMat);
    box.castShadow = true;
    itemGroup.add(box);
    const sprite = itemSprite();
    itemGroup.add(sprite);
    group.add(itemGroup);
    return { group: itemGroup, box, sprite };
  });

  const agentMeshes = agents.map((_, i) => {
    const a = avatar(AGENT_COLORS[i % AGENT_COLORS.length]);
    group.add(a.group);
    return a;
  });

  // Flip every agent AND item between the 2D billboard and 3D looks when the toggle changes.
  scope.effect((use) => {
    const on = use(billboards);
    agentMeshes.forEach((a) => a.setBillboard(on));
    itemMeshes.forEach(({ box, sprite }) => {
      box.visible = !on;
      sprite.visible = on;
    });
  });

  const respawn = () => {
    const fresh = pickDistinct(nodeIds, items.length);
    items.forEach((item, i) => {
      const n: NodeId = fresh[i % fresh.length];
      item.state = "loose";
      item.node = n;
      item.position.copy(nav.positionOf(n));
    });
  };

  mountSim(scope, time, world, () => {
    if (world.done()) respawn();
    agents.forEach((agent, i) => agentMeshes[i].group.position.copy(agent.position));
    items.forEach((item, i) => {
      const m = itemMeshes[i];
      m.group.visible = item.state !== "binned";
      m.group.position.copy(item.position);
    });
  });
};
