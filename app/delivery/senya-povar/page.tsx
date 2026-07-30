import CafeMenuPage from "../../../components/CafeMenuPage";
import { getCafe } from "../../../data/cafes";

export default function SenyaPovarPage() {
  return <CafeMenuPage cafe={getCafe("senya-povar")!} />;
}
