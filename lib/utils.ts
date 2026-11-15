export { cn } from "cn"

/** Two letters for an avatar (the account chip, the profile header): "EmbeddedArt" -> "EA", "Blue Science Park" -> "BS", "Malvacom" -> "MA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0] ?? "";
  const capitals = word.match(/\p{Lu}/gu) ?? [];
  if (capitals.length >= 2) return capitals.slice(0, 2).join("");
  return word.slice(0, 2).toUpperCase();
}
