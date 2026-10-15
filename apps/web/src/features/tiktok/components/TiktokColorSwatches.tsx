// A row of color dots for a template or draft card.
export default function TiktokColorSwatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((color, index) => (
        <span
          key={index}
          title={color}
          className="size-4 rounded-full border"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
