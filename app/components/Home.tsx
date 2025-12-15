import Time from "./Time";

const Home = () => {
	return (
		<>
			<div className="self-start flex transform translate-x-34 items-center space-x-1">
				<div className="pulse bg-green-600 rounded-full w-2 h-2"></div>
				<p className="ml-0.5">Alara Martin.</p>
			</div>

			<Time />
		</>
	);
};

export default Home;
