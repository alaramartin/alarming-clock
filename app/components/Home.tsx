import CyclingTitle from "./CyclingTitle";
import Time from "./Time";

const Home = () => {
	return (
		<div className="max-md:p-4 overflow-hidden">
			<div className="self-start flex transform translate-x-6 md:translate-x-12 items-center space-x-1">
				{/* <div className="pulse bg-green-600 rounded-full w-2 h-2"></div> */}
				<CyclingTitle />
			</div>

			<Time />
		</div>
	);
};

export default Home;
