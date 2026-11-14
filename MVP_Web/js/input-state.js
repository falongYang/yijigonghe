// 丢失焦点后可能收不到 keyup / mouseup；只释放瞬时输入，不改变战局或指令。
export function resetTransientInput(game, world, canvas) {
  game.shift = false;
  game.box = null;
  if (world) {
    for (const key of Object.keys(world.keys || {})) world.keys[key] = false;
    world.setEdge(0, 0, false);
    world.setDragPan(false);
  }
  canvas?.classList.remove('grabbing');
}
