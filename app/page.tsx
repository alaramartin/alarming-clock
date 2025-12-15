import MostRecentCommit from "./components/MostRecentCommit";
import NowPlaying from "./components/NowPlaying";
import MainDisplay from "./components/MainDisplay";

export default function Home() {
	return (
		<div className="flex h-[95vh] select-none cursor-auto m-4 items-center justify-center">
			<div className="absolute top-0 left-0 max-md:w-1/2">
				<NowPlaying />
			</div>
			<div className="absolute top-0 right-0 max-md:w-1/2">
				<MostRecentCommit />
			</div>

			<MainDisplay />
		</div>
	);
}
