import type { Metadata } from "next";
import { GameEntry } from "./game-entry";

export const metadata: Metadata = {
  title: "map_test01 Movement Lab",
  description:
    "Echoes Beyond the Stars eight-direction movement and map collision prototype.",
};

export default function Home() {
  return <GameEntry />;
}
