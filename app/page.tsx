import Clock from "./components/Clock";
import MostRecentCommit from "./components/MostRecentCommit";
import NowPlaying from "./components/NowPlaying";
import Link from "next/link";

export default function Home() {
	return (
		<div className="flex h-[95vh] select-none cursor-auto m-4 items-center justify-center">
			<div className="absolute top-0 left-0">
				<NowPlaying />
			</div>
			<div className="absolute top-0 right-0">
				<MostRecentCommit />
			</div>

			<div className="flex flex-col items-center text-textwhite border-8 border-gray-500 rounded-2xl p-20">
				<div className="self-start flex transform translate-x-8 items-center space-x-1">
					<div className="pulse bg-green-600 rounded-full w-2 h-2 inline-flex"></div>
					<p className="inline-flex">I&apos;m always online.</p>
					<Link
						href="https://www.linkedin.com/in/alara-martin/"
						className="inline-flex underline"
						target="_blank"
						rel="noopener noreferrer"
					>
						Contact me anytime.
					</Link>
				</div>

				<Clock />
			</div>
		</div>
	);
}
