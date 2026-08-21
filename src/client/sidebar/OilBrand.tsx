import {
  BrandWordmark,
  FishLogo,
} from "@deepseek-ai/dsh-client-ui-primitives";

export function OilBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="oilBrand">
      {compact
        ? <FishLogo className="oilBrandIcon" size={24} />
        : <BrandWordmark className="deepseekWordmark" size={22} />}
    </span>
  );
}
