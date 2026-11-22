/** Original color backgrounds generated locally, without external assets. */
export type BackgroundId = "white" | "black" | "green" | "blue";
export const BACKGROUNDS: { id: BackgroundId; name: string; color: string }[] = [
  { id: "white", name: "White background", color: "#ffffff" },
  { id: "black", name: "Black background", color: "#000000" },
  { id: "green", name: "Green screen", color: "#00ff00" },
  { id: "blue", name: "Blue screen", color: "#0000ff" },
];

/** A flat color remains sharp when scaled; the original PNG is saved locally. */
export async function createBackground(id: BackgroundId): Promise<{ blob: Blob; thumb: string }> {
  const background = BACKGROUNDS.find((entry) => entry.id === id);
  if (!background) throw new Error("Unknown background");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image creation is unavailable on this device");
  context.fillStyle = background.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not create background"))),
      "image/png",
    );
  });
  return { blob, thumb: canvas.toDataURL("image/png") };
}
