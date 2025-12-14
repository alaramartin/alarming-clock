import Link from "next/link";
import Time from "./Time";

const Home = () => {
	return (
		<>
			<div className="self-start flex transform translate-x-34 items-center space-x-1">
				<div className="pulse bg-green-600 rounded-full w-2 h-2"></div>
				<p className="">I&apos;m always online.</p>

				<Link
					href="https://www.linkedin.com/in/alara-martin/"
					className="inline-flex underline"
					target="_blank"
					rel="noopener noreferrer"
				>
					Contact me anytime.
				</Link>
			</div>

			<Time />
		</>
	);
};

export default Home;
