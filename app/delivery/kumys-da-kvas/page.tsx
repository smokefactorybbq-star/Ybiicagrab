import CafeMenuPage from "../../../components/CafeMenuPage";
import { getCafe } from "../../../data/cafes";

export default function KumysDaKvasPage() {
  return <CafeMenuPage cafe={getCafe("kumys-da-kvas")!} />;
}
