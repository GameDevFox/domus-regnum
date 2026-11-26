import { loadGLTF } from "@kitsune/common-web";

export const RoomModel = async () => {
  const url = "/models/room-model/room-model.gltf";

  const gltf = await loadGLTF(url);

  const group = gltf.scene;

  // const floor = group.getObjectByName("Floor");
  // if(!floor)
  //   throw new Error("\"Floor\" not found in .gltf file");;

  // console.log("Floor", floor);
  // const mat: MeshStandardMaterial = (floor as any).material;

  group.position.z = 2.5;

  // scene.add(floor);
  // scene.add(group);

  return group;
};
