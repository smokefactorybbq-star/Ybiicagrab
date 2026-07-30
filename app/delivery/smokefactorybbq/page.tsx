import CafeMenuPage from "../../../components/CafeMenuPage";
import { getCafe } from "../../../data/cafes";

export default function SmokeFactoryPage() {
  return <CafeMenuPage cafe={getCafe("smokefactorybbq")!} />;
}
