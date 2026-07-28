import type { Metadata } from "next";
import { MovementLab } from "./movement-lab";

export const metadata: Metadata = {
  title: "map_test01 Movement Lab",
  description:
    "Echoes Beyond the Stars eight-direction movement and map collision prototype.",
};

export default function Home() {
  return <MovementLab />;
}
